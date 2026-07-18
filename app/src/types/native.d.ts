/**
 * Type stubs for custom Android native modules.
 */

import type {NativeModule} from 'react-native';

interface BluetoothSessionNative extends NativeModule {
  startListening(): Promise<boolean>;
  stopListening(): Promise<boolean>;
  isConnected(): Promise<boolean>;
  getConnectedDeviceName(): Promise<string | null>;
}

interface SchedulerNative extends NativeModule {
  start(intervalMs: number, phase0: boolean): Promise<boolean>;
  stop(): Promise<boolean>;
  setIntervalMs(intervalMs: number): Promise<boolean>;
  setQuietMode(quiet: boolean): Promise<boolean>;
  isRunning(): Promise<boolean>;
  getPhase0BatteryLog(): Promise<string>;
}

interface SpeechNative extends NativeModule {
  isTtsReady(): Promise<boolean>;
  speak(text: string): Promise<boolean>;
  stopSpeaking(): Promise<boolean>;
  startListening(): Promise<string>;
  stopListening(): Promise<boolean>;
  logLatency(
    endOfSpeechMs: number,
    ttsStartMs: number,
    roundTripMs: number,
  ): Promise<boolean>;
  getLatencyLog(): Promise<string>;
}

interface CalendarNative extends NativeModule {
  createEvent(
    title: string,
    startIso: string,
    endIso: string,
    notes: string | null,
    allDay: boolean,
  ): Promise<string>;
}

interface WakeWordNative extends NativeModule {
  isSupported(): Promise<boolean>;
  start(keyword: string): Promise<boolean>;
  stop(): Promise<boolean>;
}

declare module 'react-native' {
  interface NativeModulesStatic {
    BluetoothSessionModule: BluetoothSessionNative;
    SchedulerModule: SchedulerNative;
    SpeechModule: SpeechNative;
    CalendarModule: CalendarNative;
    WakeWordModule: WakeWordNative;
  }
}

export {};
