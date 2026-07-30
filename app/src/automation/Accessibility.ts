/**
 * JS wrapper around AccessibilityModule (native Android AccessibilityService).
 */

import {NativeModules, Platform} from 'react-native';

const LINKING_ERROR = 'AccessibilityModule is not linked. Rebuild the Android app.';

const NativeAccess = (NativeModules.AccessibilityModule
  ? NativeModules.AccessibilityModule
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      },
    )) as any;

export const Accessibility = {
  async isServiceEnabled(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }
    return NativeAccess.isServiceEnabled();
  },

  async dumpLayoutJSON(): Promise<string> {
    if (Platform.OS !== 'android') {
      return '{}';
    }
    return NativeAccess.dumpLayoutJSON();
  },

  async click(viewId: string | null, text: string | null): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }
    return NativeAccess.click(viewId, text);
  },

  async longClick(viewId: string | null, text: string | null): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }
    return NativeAccess.longClick(viewId, text);
  },

  async typeText(viewId: string | null, text: string | null, value: string): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }
    return NativeAccess.typeText(viewId, text, value);
  },

  async scroll(direction: 'up' | 'down'): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }
    return NativeAccess.scroll(direction);
  },

  async tapCoordinate(x: number, y: number): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }
    return NativeAccess.tapCoordinate(x, y);
  },

  async swipeCoordinate(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    durationMs: number,
  ): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }
    return NativeAccess.swipeCoordinate(x1, y1, x2, y2, durationMs);
  },

  async navigate(action: 'back' | 'home' | 'recents' | 'notifications'): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }
    return NativeAccess.navigate(action);
  },

  async hasSensitiveField(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }
    return NativeAccess.hasSensitiveField();
  },

  async pasteText(viewId: string | null, text: string | null): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }
    return NativeAccess.pasteText(viewId, text);
  },
};
