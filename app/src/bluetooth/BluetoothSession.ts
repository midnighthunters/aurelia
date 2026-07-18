/**
 * JS wrapper around BluetoothSessionModule (native).
 * Emits connect/disconnect for the UX loop.
 */

import {NativeEventEmitter, NativeModules, Platform} from 'react-native';

type BtPayload = {
  connected: boolean;
  deviceName?: string | null;
  timestamp?: number;
};

type Listener = (payload: BtPayload) => void;

const LINKING_ERROR =
  "BluetoothSessionModule is not linked. Rebuild the Android app after adding native modules.";

const NativeBt = NativeModules.BluetoothSessionModule
  ? NativeModules.BluetoothSessionModule
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      },
    );

const emitter =
  Platform.OS === 'android' && NativeModules.BluetoothSessionModule
    ? new NativeEventEmitter(NativeModules.BluetoothSessionModule)
    : null;

export const BluetoothSession = {
  async startListening(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      // Android-only pass — portable note for future iOS
      return false;
    }
    return NativeBt.startListening();
  },

  async stopListening(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }
    return NativeBt.stopListening();
  },

  async isConnected(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }
    return NativeBt.isConnected();
  },

  async getConnectedDeviceName(): Promise<string | null> {
    if (Platform.OS !== 'android') {
      return null;
    }
    return NativeBt.getConnectedDeviceName();
  },

  onConnected(listener: Listener) {
    if (!emitter) {
      return {remove: () => {}};
    }
    return emitter.addListener('bluetoothHeadsetConnected', listener);
  },

  onDisconnected(listener: Listener) {
    if (!emitter) {
      return {remove: () => {}};
    }
    return emitter.addListener('bluetoothHeadsetDisconnected', listener);
  },

  onScoState(listener: (p: {state: number; label: string}) => void) {
    if (!emitter) {
      return {remove: () => {}};
    }
    return emitter.addListener('bluetoothScoState', listener);
  },
};
