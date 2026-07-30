/**
 * Contextual Permission Manager for Android AI Agent.
 * Requests permissions only when a specific task requires them, providing clear explanations.
 */

import {PermissionsAndroid, Platform} from 'react-native';

export type RequiredPermission =
  | 'accessibility'
  | 'overlay'
  | 'microphone'
  | 'phone'
  | 'call_log'
  | 'sms'
  | 'contacts'
  | 'calendar'
  | 'camera'
  | 'location'
  | 'storage'
  | 'notifications';

export async function requestTaskPermission(permission: RequiredPermission): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  try {
    switch (permission) {
      case 'microphone': {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Microphone Permission Needed',
            message: 'Aurelia needs microphone access to listen to your voice instructions.',
            buttonPositive: 'Grant',
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }

      case 'phone': {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CALL_PHONE,
          {
            title: 'Phone Call Permission Needed',
            message: 'Aurelia needs phone access to place calls on your behalf.',
            buttonPositive: 'Grant',
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }

      case 'call_log': {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_CALL_LOG,
          {
            title: 'Call Log Permission Needed',
            message: 'Aurelia needs access to read recent call logs for redialing.',
            buttonPositive: 'Grant',
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }

      case 'sms': {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.READ_SMS,
          PermissionsAndroid.PERMISSIONS.SEND_SMS,
        ]);
        return (
          granted[PermissionsAndroid.PERMISSIONS.READ_SMS] === PermissionsAndroid.RESULTS.GRANTED &&
          granted[PermissionsAndroid.PERMISSIONS.SEND_SMS] === PermissionsAndroid.RESULTS.GRANTED
        );
      }

      case 'contacts': {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
          PermissionsAndroid.PERMISSIONS.WRITE_CONTACTS,
        ]);
        return (
          granted[PermissionsAndroid.PERMISSIONS.READ_CONTACTS] === PermissionsAndroid.RESULTS.GRANTED &&
          granted[PermissionsAndroid.PERMISSIONS.WRITE_CONTACTS] === PermissionsAndroid.RESULTS.GRANTED
        );
      }

      case 'calendar': {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.READ_CALENDAR,
          PermissionsAndroid.PERMISSIONS.WRITE_CALENDAR,
        ]);
        return (
          granted[PermissionsAndroid.PERMISSIONS.READ_CALENDAR] === PermissionsAndroid.RESULTS.GRANTED &&
          granted[PermissionsAndroid.PERMISSIONS.WRITE_CALENDAR] === PermissionsAndroid.RESULTS.GRANTED
        );
      }

      case 'camera': {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Camera Permission Needed',
            message: 'Aurelia needs camera access to take photos or record video.',
            buttonPositive: 'Grant',
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }

      case 'location': {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Permission Needed',
            message: 'Aurelia needs location access for navigation and job search location filters.',
            buttonPositive: 'Grant',
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }

      case 'storage': {
        if (Platform.Version >= 33) {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
          );
          return granted === PermissionsAndroid.RESULTS.GRANTED;
        } else {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
          );
          return granted === PermissionsAndroid.RESULTS.GRANTED;
        }
      }

      default:
        return true;
    }
  } catch (e) {
    console.warn('Permission error:', e);
    return false;
  }
}
