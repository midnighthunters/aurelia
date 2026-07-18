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
import {loadRelationships} from '../automation/relationships';
import {
  appendTurn,
  clearSessionMemory,
  getHistory,
  getOrCreateSessionId,
} from '../memory/sessionMemory';
import {Speech} from './Speech';

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
    // Guardrail: recording only starts here on explicit tap
    const transcript = (await Speech.startListening()).trim();
    endSub.remove();

    if (!transcript) {
      cb.onStatus?.('No speech detected');
      cb.onError?.('Empty transcript');
      return;
    }

    cb.onTranscript?.(transcript);
    cb.onStatus?.('Thinking…');

    const local = detectLocalCommand(transcript);
    if (local === 'quiet_on') {
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

    const sessionId = await getOrCreateSessionId();
    const history = await getHistory();
    const relationships = await loadRelationships();

    const response = await requestReply({
      transcript,
      session_id: sessionId,
      history,
      client_now_iso: clientNowIso(),
      client_timezone: getClientTimezone(),
      quiet_mode: cb.isQuietMode?.() ?? false,
      relationships,
    });

    await appendTurn('user', transcript);
    await appendTurn('assistant', response.reply_text);

    let speakText = response.reply_text;
    const action = response.action as ActionPayload;
    if (action && action.type !== 'none') {
      cb.onStatus?.('Running action…');
      const result = await executeAction(action);
      cb.onAction?.(action, result.message);
      // Prefer backend reply; fall back to automation speakHint if reply was empty
      if (!speakText && result.speakHint) {
        speakText = result.speakHint;
      }
      // If action failed and we have a hint, append briefly
      if (!result.ok && result.speakHint) {
        speakText = `${speakText} ${result.speakHint}`.trim();
      }
    }

    cb.onReply?.(speakText);
    cb.onStatus?.('Speaking…');
    const ttsStart = Date.now();
    await Speech.speak(speakText);
    const roundTrip = ttsStart - endOfSpeechMs;
    await Speech.logLatency(endOfSpeechMs, ttsStart, roundTrip);
    cb.onLatencyMs?.(roundTrip);
    cb.onStatus?.('Idle');
  } catch (e: any) {
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
