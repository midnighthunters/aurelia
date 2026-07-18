/**
 * Runtime permission helpers for Android MVP.
 */

import {PermissionsAndroid, Platform} from 'react-native';

export async function requestAllRuntimePermissions(): Promise<Record<string, string>> {
  if (Platform.OS !== 'android') {
    return {};
  }

  const api = Platform.Version as number;
  const wanted: Array<{key: string; perm: string}> = [
    {key: 'mic', perm: PermissionsAndroid.PERMISSIONS.RECORD_AUDIO},
    {key: 'readCalendar', perm: PermissionsAndroid.PERMISSIONS.READ_CALENDAR},
    {key: 'writeCalendar', perm: PermissionsAndroid.PERMISSIONS.WRITE_CALENDAR},
  ];

  if (api >= 31) {
    wanted.push(
      {key: 'btConnect', perm: 'android.permission.BLUETOOTH_CONNECT'},
      {key: 'btScan', perm: 'android.permission.BLUETOOTH_SCAN'},
    );
  }
  if (api >= 33) {
    wanted.push({key: 'notifications', perm: 'android.permission.POST_NOTIFICATIONS'});
  }

  const result: Record<string, string> = {};
  for (const {key, perm} of wanted) {
    try {
      const status = await PermissionsAndroid.request(perm as any);
      result[key] = status;
    } catch (e: any) {
      result[key] = e?.message || 'error';
    }
  }
  return result;
}
