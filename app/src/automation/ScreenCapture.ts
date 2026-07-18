/**
 * JS wrapper for ScreenCaptureModule (native MediaProjection).
 */

import {NativeEventEmitter, NativeModules, Platform} from 'react-native';

const LINKING_ERROR = 'ScreenCaptureModule is not linked. Rebuild the Android app.';

const NativeScreen = NativeModules.ScreenCaptureModule
  ? NativeModules.ScreenCaptureModule
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      },
    );

const emitter =
  Platform.OS === 'android' && NativeModules.ScreenCaptureModule
    ? new NativeEventEmitter(NativeModules.ScreenCaptureModule)
    : null;

export const ScreenCapture = {
  async isSupported(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }
    return NativeScreen.isSupported();
  },

  async startCapture(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }
    return NativeScreen.startCapture();
  },

  async stopCapture(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }
    return NativeScreen.stopCapture();
  },

  onScreenFrame(listener: (payload: {frame: string; timestamp: number}) => void) {
    if (!emitter) {
      return {remove: () => {}};
    }
    return emitter.addListener('screenFrame', listener);
  },

  onStarted(listener: () => void) {
    if (!emitter) {
      return {remove: () => {}};
    }
    return emitter.addListener('onScreenCaptureStarted', listener);
  },

  onStopped(listener: () => void) {
    if (!emitter) {
      return {remove: () => {}};
    }
    return emitter.addListener('onScreenCaptureStopped', listener);
  },

  onError(listener: (err: {code: string; message: string}) => void) {
    if (!emitter) {
      return {remove: () => {}};
    }
    return emitter.addListener('onScreenCaptureError', listener);
  },
};
