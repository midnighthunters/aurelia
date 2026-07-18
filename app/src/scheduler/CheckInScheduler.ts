/**
 * Check-in timer UI/state. Native ForegroundSchedulerService does the actual backgrounding.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {NativeEventEmitter, NativeModules, Platform} from 'react-native';
import {CONFIG} from '../config';

const LINKING_ERROR = 'SchedulerModule is not linked. Rebuild the Android app.';

const NativeScheduler = NativeModules.SchedulerModule
  ? NativeModules.SchedulerModule
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      },
    );

const emitter =
  Platform.OS === 'android' && NativeModules.SchedulerModule
    ? new NativeEventEmitter(NativeModules.SchedulerModule)
    : null;

export const CheckInScheduler = {
  async getIntervalMs(): Promise<number> {
    const raw = await AsyncStorage.getItem(CONFIG.storageKeys.checkInIntervalMs);
    if (!raw) {
      return CONFIG.defaultCheckInIntervalMs;
    }
    const n = Number(raw);
    return Number.isFinite(n) ? n : CONFIG.defaultCheckInIntervalMs;
  },

  async setIntervalMs(ms: number): Promise<void> {
    const clamped = Math.min(
      CONFIG.maxCheckInIntervalMs,
      Math.max(CONFIG.minCheckInIntervalMs, ms),
    );
    await AsyncStorage.setItem(CONFIG.storageKeys.checkInIntervalMs, String(clamped));
    if (Platform.OS === 'android') {
      await NativeScheduler.setIntervalMs(clamped);
    }
  },

  async getQuietMode(): Promise<boolean> {
    const raw = await AsyncStorage.getItem(CONFIG.storageKeys.quietMode);
    return raw === 'true';
  },

  async setQuietMode(quiet: boolean): Promise<void> {
    await AsyncStorage.setItem(CONFIG.storageKeys.quietMode, quiet ? 'true' : 'false');
    if (Platform.OS === 'android') {
      await NativeScheduler.setQuietMode(quiet);
    }
  },

  async start(options?: {phase0?: boolean; intervalMs?: number}): Promise<void> {
    if (Platform.OS !== 'android') {
      return;
    }
    const intervalMs =
      options?.intervalMs ??
      (options?.phase0 ? CONFIG.phase0ProbeIntervalMs : await this.getIntervalMs());
    const quiet = await this.getQuietMode();
    await NativeScheduler.setQuietMode(quiet);
    await NativeScheduler.start(intervalMs, !!options?.phase0);
  },

  async stop(): Promise<void> {
    if (Platform.OS !== 'android') {
      return;
    }
    await NativeScheduler.stop();
  },

  async isRunning(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }
    return NativeScheduler.isRunning();
  },

  async getPhase0BatteryLog(): Promise<string> {
    if (Platform.OS !== 'android') {
      return '';
    }
    return NativeScheduler.getPhase0BatteryLog();
  },

  onProactiveCheckIn(listener: (p: {timestamp: number; phase0?: boolean}) => void) {
    if (!emitter) {
      return {remove: () => {}};
    }
    return emitter.addListener('proactiveCheckIn', listener);
  },

  onCheckInSuppressed(listener: (p: {reason: string}) => void) {
    if (!emitter) {
      return {remove: () => {}};
    }
    return emitter.addListener('checkInSuppressed', listener);
  },

  onPhase0Battery(listener: (p: {event: string; batteryPct: number}) => void) {
    if (!emitter) {
      return {remove: () => {}};
    }
    return emitter.addListener('phase0BatterySample', listener);
  },
};
