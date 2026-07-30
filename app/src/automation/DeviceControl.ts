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

  async placeCall(number: string): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    return (NativeDevice as any).placeCall(number);
  },

  async openDialerPrefilled(number: string): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    return (NativeDevice as any).openDialerPrefilled(number);
  },

  async queryContacts(nameQuery: string): Promise<Array<{name: string; number: string}>> {
    if (Platform.OS !== 'android') return [];
    return (NativeDevice as any).queryContacts(nameQuery);
  },

  async copyToClipboard(label: string, text: string): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    return (NativeDevice as any).copyToClipboard(label, text);
  },

  async getClipboardText(): Promise<string> {
    if (Platform.OS !== 'android') return '';
    return (NativeDevice as any).getClipboardText();
  },

  async openSystemSettings(settingType: string): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    return (NativeDevice as any).openSystemSettings(settingType);
  },

  async sendMediaKey(action: string): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    return (NativeDevice as any).sendMediaKey(action);
  },

  async requestUninstallApp(packageName: string): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    return (NativeDevice as any).requestUninstallApp(packageName);
  },
};
