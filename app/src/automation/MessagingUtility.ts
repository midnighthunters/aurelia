/**
 * JS wrapper around MessagingUtilityModule (native contacts, calls, and notifications).
 */

import {NativeModules, Platform} from 'react-native';

const LINKING_ERROR = 'MessagingUtilityModule is not linked. Rebuild the Android app.';

const NativeMsg = NativeModules.MessagingUtilityModule
  ? NativeModules.MessagingUtilityModule
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      },
    );

export type SystemContact = {
  name: string;
  number: string;
};

export type SystemNotification = {
  title: string;
  text: string;
  package: string;
  timestamp: string;
};

export const MessagingUtility = {
  async scanContacts(): Promise<SystemContact[]> {
    if (Platform.OS !== 'android') {
      return [];
    }
    return (NativeMsg as any).scanContacts();
  },

  async dialCall(number: string): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }
    return (NativeMsg as any).dialCall(number);
  },

  async getRecentNotifications(): Promise<SystemNotification[]> {
    if (Platform.OS !== 'android') {
      return [];
    }
    return (NativeMsg as any).getRecentNotifications();
  },
};
