/**
 * STT → backend /reply → optional automation → TTS.
 * Logs end-of-speech to TTS-start latency for the <2s MVP target.
 */

import {
  clearServerSession,
  clientNowIso,
  getClientTimezone,
  requestReply,
  type ActionPayload,
  type HistoryTurn,
} from '../api/client';
import {executeAction} from '../automation/taskAutomation';
import {Accessibility} from '../automation/Accessibility';
import {loadRelationships} from '../automation/relationships';
import {
  appendTurn,
  clearSessionMemory,
  getHistory,
  getOrCreateSessionId,
} from '../memory/sessionMemory';
import {Speech} from './Speech';
import {streamClient} from '../api/stream';

export type ConversationCallbacks = {
  onStatus?: (status: string) => void;
  onTranscript?: (text: string) => void;
  onReply?: (text: string) => void;
  onAction?: (action: ActionPayload, resultMessage: string) => void;
  onLatencyMs?: (ms: number) => void;
  onError?: (err: string) => void;
  isQuietMode?: () => boolean;
};

/** Detect spoken quiet-mode commands before hitting the brain (fast path). */
export function detectLocalCommand(
  transcript: string,
): 'quiet_on' | 'quiet_off' | null {
  const t = transcript.trim().toLowerCase();
  if (
    /\b(quiet mode|go quiet|be quiet|not now|stop checking in|silence)\b/.test(t) &&
    !/\b(disable|end|exit|leave|cancel|turn off)\b.*\bquiet\b/.test(t)
  ) {
    if (/\b(disable|end|exit|leave|cancel|turn off|stop)\b.*\bquiet\b/.test(t)) {
      return 'quiet_off';
    }
    if (/\bquiet mode on\b|\benable quiet\b|\bgo quiet\b|\bbe quiet\b|\bnot now\b|\bstop checking in\b/.test(t)) {
      return 'quiet_on';
    }
    if (/\bquiet mode\b/.test(t) && !/\boff\b/.test(t)) {
      return 'quiet_on';
    }
  }
  if (/\b(quiet mode off|disable quiet|end quiet|leave quiet mode|cancel quiet)\b/.test(t)) {
    return 'quiet_off';
  }
  return null;
}

export async function runTapToTalkTurn(cb: ConversationCallbacks = {}): Promise<void> {
  let endOfSpeechMs = Date.now();

  const endSub = Speech.on('sttEndOfSpeech', (p: {timestamp?: number}) => {
    endOfSpeechMs = p?.timestamp ? Number(p.timestamp) : Date.now();
  });

  try {
    cb.onStatus?.('Listening…');

    let replyResolved = false;
    let replyText = '';
    let replyAction: ActionPayload = {type: 'none'};
    let replyError: string | null = null;

    // Start WebSocket stream and screen frame pipeline
    await streamClient.startStream(
      (text, action) => {
        replyText = text;
        replyAction = action;
        replyResolved = true;
      },
      (err) => {
        replyError = err;
        replyResolved = true;
      }
    );

    // Guardrail: recording only starts here on explicit tap
    const transcript = (await Speech.startListening()).trim();
    endSub.remove();

    if (!transcript) {
      streamClient.stopStream();
      cb.onStatus?.('No speech detected');
      cb.onError?.('Empty transcript');
      return;
    }

    cb.onTranscript?.(transcript);
    cb.onStatus?.('Thinking…');

    const local = detectLocalCommand(transcript);
    if (local === 'quiet_on') {
      streamClient.stopStream();
      await appendTurn('user', transcript);
      const reply = "Okay — quiet mode on. I won't check in until you turn it off.";
      await appendTurn('assistant', reply);
      cb.onReply?.(reply);
      const ttsStart = Date.now();
      await Speech.speak(reply);
      const roundTrip = ttsStart - endOfSpeechMs;
      await Speech.logLatency(endOfSpeechMs, ttsStart, roundTrip);
      cb.onLatencyMs?.(roundTrip);
      cb.onStatus?.('Quiet mode on');
      return;
    }
    if (local === 'quiet_off') {
      streamClient.stopStream();
      await appendTurn('user', transcript);
      const reply = 'Quiet mode off. Check-ins are back on.';
      await appendTurn('assistant', reply);
      cb.onReply?.(reply);
      const ttsStart = Date.now();
      await Speech.speak(reply);
      const roundTrip = ttsStart - endOfSpeechMs;
      await Speech.logLatency(endOfSpeechMs, ttsStart, roundTrip);
      cb.onLatencyMs?.(roundTrip);
      cb.onStatus?.('Quiet mode off');
      return;
    }

    // Submit user turn to WebSocket loop
    await streamClient.sendSpeechTurn(transcript, cb.isQuietMode?.() ?? false);

    // Active multi-turn Agent Execution Loop
    let keepRunning = true;
    let turnCount = 0;
    const maxAgentTurns = 10;
    let speakText = '';

    while (keepRunning && turnCount < maxAgentTurns) {
      replyResolved = false;
      replyError = null;

      // Block synchronously until the backend replies or timeout occurs
      const startWait = Date.now();
      while (!replyResolved && Date.now() - startWait < 15000) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      if (replyError) {
        throw new Error(replyError);
      }
      if (!replyResolved) {
        throw new Error('Timeout waiting for brain reply');
      }

      // Record turns in local conversation memory
      if (turnCount === 0) {
        await appendTurn('user', transcript);
      }
      await appendTurn('assistant', replyText);
      speakText = replyText;

      const action = replyAction;
      if (action && action.type !== 'none') {
        cb.onStatus?.('Running action…');
        const result = await executeAction(action);
        cb.onAction?.(action, result.message);

        // Incorporate helper hints
        if (!speakText && result.speakHint) {
          speakText = result.speakHint;
        }
        if (!result.ok && result.speakHint) {
          speakText = `${speakText} ${result.speakHint}`.trim();
        }

        // Get updated accessibility screen tree
        const layout = await Accessibility.dumpLayoutJSON();
        const sessionId = await getOrCreateSessionId();

        // Submit action feedback to VLM scheduler for planning next step
        cb.onStatus?.('Planning next step…');
        await streamClient.sendActionResult(result.message, result.ok, layout, sessionId);
        turnCount++;
      } else {
        // No action or type 'none': execution finished
        keepRunning = false;
      }
    }

    streamClient.stopStream();

    cb.onReply?.(speakText);
    cb.onStatus?.('Speaking…');
    const ttsStart = Date.now();
    await Speech.speak(speakText);
    const roundTrip = ttsStart - endOfSpeechMs;
    await Speech.logLatency(endOfSpeechMs, ttsStart, roundTrip);
    cb.onLatencyMs?.(roundTrip);
    cb.onStatus?.('Idle');
  } catch (e: any) {
    streamClient.stopStream();
    endSub.remove();
    const msg = e?.message || String(e);
    cb.onError?.(msg);
    cb.onStatus?.('Error');
    try {
      await Speech.speak("Sorry, something went wrong on that turn.");
    } catch {
      // ignore TTS failure
    }
  }
}

export async function speakCheckIn(prompt: string): Promise<void> {
  await Speech.speak(prompt);
}

export async function onEarbudsDisconnected(): Promise<void> {
  const oldId = await getOrCreateSessionId();
  try {
    await clearServerSession(oldId);
  } catch {
    // offline is fine — local clear still happens
  }
  await clearSessionMemory();
}

export type {HistoryTurn};
