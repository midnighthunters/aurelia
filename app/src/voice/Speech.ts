/**
 * STT / TTS wrappers around SpeechModule (Android SpeechRecognizer + TextToSpeech).
 * Swappable boundary: cloud STT/TTS can replace the native module later.
 */

import {NativeEventEmitter, NativeModules, Platform} from 'react-native';

const LINKING_ERROR = 'SpeechModule is not linked. Rebuild the Android app.';

const NativeSpeech = NativeModules.SpeechModule
  ? NativeModules.SpeechModule
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      },
    );

const emitter =
  Platform.OS === 'android' && NativeModules.SpeechModule
    ? new NativeEventEmitter(NativeModules.SpeechModule)
    : null;

export const Speech = {
  async isTtsReady(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }
    return NativeSpeech.isTtsReady();
  },

  /** Speak text through current audio route (earbuds when connected). */
  async speak(text: string): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }
    return NativeSpeech.speak(text);
  },

  async stopSpeaking(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }
    return NativeSpeech.stopSpeaking();
  },

  /**
   * Tap-to-talk: start STT. Resolves with final transcript.
   * Audio is NOT recorded until this is called (guardrail).
   */
  async startListening(): Promise<string> {
    if (Platform.OS !== 'android') {
      throw new Error('STT is Android-only in this build');
    }
    return NativeSpeech.startListening();
  },

  async stopListening(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }
    return NativeSpeech.stopListening();
  },

  async logLatency(
    endOfSpeechMs: number,
    ttsStartMs: number,
    roundTripMs: number,
  ): Promise<void> {
    if (Platform.OS !== 'android') {
      return;
    }
    await NativeSpeech.logLatency(endOfSpeechMs, ttsStartMs, roundTripMs);
  },

  async getLatencyLog(): Promise<string> {
    if (Platform.OS !== 'android') {
      return '';
    }
    return NativeSpeech.getLatencyLog();
  },

  on(event: string, listener: (payload: any) => void) {
    if (!emitter) {
      return {remove: () => {}};
    }
    return emitter.addListener(event, listener);
  },
};
