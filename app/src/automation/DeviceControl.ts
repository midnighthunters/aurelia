/**
 * JS wrapper around DeviceControlModule (native Android OS controls).
 */

import {NativeModules, Platform} from 'react-native';

const LINKING_ERROR = 'DeviceControlModule is not linked. Rebuild the Android app.';

const NativeDevice = NativeModules.DeviceControlModule
  ? NativeModules.DeviceControlModule
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      },
    );

export const DeviceControl = {
  async setVolume(
    streamType: 'music' | 'ring' | 'notification' | 'system',
    percent: number,
  ): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }
    return (NativeDevice as any).setVolume(streamType, percent);
  },

  async setBrightness(percent: number): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }
    return (NativeDevice as any).setBrightness(percent);
  },

  async setDndMode(enabled: boolean): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }
    return (NativeDevice as any).setDndMode(enabled);
  },

  async toggleRadio(radioType: 'wifi' | 'bluetooth', enabled: boolean): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }
    return (NativeDevice as any).toggleRadio(radioType, enabled);
  },

  async launchApp(appName: string): Promise<string> {
    if (Platform.OS !== 'android') {
      throw new Error('OS control is Android-only');
    }
    return (NativeDevice as any).launchApp(appName);
  },

  async setAlarm(hour: number, minute: number, message: string): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }
    return (NativeDevice as any).setAlarm(hour, minute, message);
  },

  async setTimer(seconds: number, message: string): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }
    return (NativeDevice as any).setTimer(seconds, message);
  },
};
