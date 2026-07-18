/**
 * Tier 1 Task Automation Module
 * - Calendar: silent create via native CalendarModule
 * - WhatsApp / SMS / email: open pre-filled via Linking (user taps send)
 *
 * Tier 2 (accessibility hands-free send) is NOT built — requires explicit go-ahead.
 */

import {Linking, NativeModules, Platform} from 'react-native';
import type {ActionPayload} from '../api/client';
import {loadRelationships, resolveRecipient} from './relationships';

export type AutomationResult = {
  ok: boolean;
  kind: 'none' | 'calendar' | 'message';
  message: string;
  /** Spoken confirmation the agent should use if backend didn't already */
  speakHint?: string;
};

const CalendarNative = NativeModules.CalendarModule;

function encode(s: string): string {
  return encodeURIComponent(s);
}

/** Digits only for WhatsApp phone param (E.164 without +). */
function whatsAppPhone(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}

async function createCalendarEvent(action: Extract<ActionPayload, {type: 'create_calendar_event'}>): Promise<AutomationResult> {
  if (Platform.OS !== 'android' || !CalendarNative) {
    return {
      ok: false,
      kind: 'calendar',
      message: 'Calendar module unavailable',
    };
  }
  try {
    const id = await CalendarNative.createEvent(
      action.title,
      action.start_iso,
      action.end_iso,
      action.notes ?? null,
      !!action.all_day,
    );
    return {
      ok: true,
      kind: 'calendar',
      message: `Created calendar event id=${id}: ${action.title}`,
      // Calendar is intentionally silent to the user beyond the LLM reply
    };
  } catch (e: any) {
    return {
      ok: false,
      kind: 'calendar',
      message: e?.message || String(e),
      speakHint: "I couldn't add that to your calendar. Check calendar permission in settings.",
    };
  }
}

async function openMessage(action: Extract<ActionPayload, {type: 'send_message'}>): Promise<AutomationResult> {
  const relationships = await loadRelationships();
  const {resolved, alias} = resolveRecipient(action.recipient, relationships);

  if (!resolved) {
    return {
      ok: false,
      kind: 'message',
      message: `Unknown recipient alias: ${alias}`,
      speakHint: `I don't know who "${action.recipient}" is. Add them under Relationships in the app first.`,
    };
  }

  const body = action.body || '';
  let url = '';
  let appLabel: string = action.channel;

  switch (action.channel) {
    case 'whatsapp': {
      const phone = whatsAppPhone(resolved);
      url = `whatsapp://send?phone=${phone}&text=${encode(body)}`;
      appLabel = 'WhatsApp';
      break;
    }
    case 'sms': {
      // sms: scheme; body param varies slightly by OEM but works on stock Android
      url = `sms:${resolved}?body=${encode(body)}`;
      appLabel = 'Messages';
      break;
    }
    case 'email': {
      const subject = action.subject || '';
      url = `mailto:${resolved}?subject=${encode(subject)}&body=${encode(body)}`;
      appLabel = 'email';
      break;
    }
    default:
      return {
        ok: false,
        kind: 'message',
        message: `Unknown channel: ${(action as any).channel}`,
      };
  }

  try {
    const can = await Linking.canOpenURL(url);
    // WhatsApp may return false if not installed; still try open for better error path
    await Linking.openURL(url);
    return {
      ok: true,
      kind: 'message',
      message: `Opened ${appLabel} for ${resolved} (canOpen=${can})`,
      speakHint: `I've opened ${appLabel} with the message ready — just hit send.`,
    };
  } catch (e: any) {
    return {
      ok: false,
      kind: 'message',
      message: e?.message || String(e),
      speakHint: `I couldn't open ${appLabel}. Is it installed?`,
    };
  }
}

import {Accessibility} from './Accessibility';
import {DeviceControl} from './DeviceControl';
import {MessagingUtility} from './MessagingUtility';

/**
 * Execute a structured action from the brain. Safe no-op for type "none".
 * Always be upfront when opening another app (message channels).
 */
export async function executeAction(action: ActionPayload | null | undefined): Promise<AutomationResult> {
  if (!action || action.type === 'none') {
    return {ok: true, kind: 'none', message: 'no action'};
  }
  if (action.type === 'create_calendar_event') {
    return createCalendarEvent(action);
  }
  if (action.type === 'send_message') {
    return openMessage(action);
  }
  if (action.type === 'click') {
    const ok = await Accessibility.click(action.view_id ?? null, action.text ?? null);
    return {
      ok,
      kind: 'none',
      message: `click id=${action.view_id} text=${action.text} ok=${ok}`,
      speakHint: ok ? undefined : 'I was unable to click that item. Is it visible?'
    };
  }
  if (action.type === 'long_click') {
    const ok = await Accessibility.longClick(action.view_id ?? null, action.text ?? null);
    return {
      ok,
      kind: 'none',
      message: `long_click id=${action.view_id} text=${action.text} ok=${ok}`,
      speakHint: ok ? undefined : 'I was unable to long press that item.'
    };
  }
  if (action.type === 'type_text') {
    const ok = await Accessibility.typeText(action.view_id ?? null, action.text ?? null, action.value);
    return {
      ok,
      kind: 'none',
      message: `type_text id=${action.view_id} text=${action.text} ok=${ok}`,
      speakHint: ok ? undefined : 'I was unable to enter text into that field.'
    };
  }
  if (action.type === 'scroll') {
    const ok = await Accessibility.scroll(action.direction);
    return {
      ok,
      kind: 'none',
      message: `scroll direction=${action.direction} ok=${ok}`,
      speakHint: ok ? undefined : 'I could not scroll further.'
    };
  }
  if (action.type === 'tap_coordinate') {
    const ok = await Accessibility.tapCoordinate(action.x, action.y);
    return {
      ok,
      kind: 'none',
      message: `tap x=${action.x} y=${action.y} ok=${ok}`,
      speakHint: ok ? undefined : 'I could not tap those coordinates.'
    };
  }
  if (action.type === 'swipe_coordinate') {
    const ok = await Accessibility.swipeCoordinate(action.x1, action.y1, action.x2, action.y2, action.duration_ms ?? 300);
    return {
      ok,
      kind: 'none',
      message: `swipe x1=${action.x1} y1=${action.y1} x2=${action.x2} y2=${action.y2} ok=${ok}`,
      speakHint: ok ? undefined : 'I could not swipe across those coordinates.'
    };
  }
  if (action.type === 'navigate') {
    const ok = await Accessibility.navigate(action.action);
    return {
      ok,
      kind: 'none',
      message: `navigate action=${action.action} ok=${ok}`
    };
  }
  if (action.type === 'wait') {
    const ms = action.ms ?? 1000;
    await new Promise(resolve => setTimeout(resolve, ms));
    return {
      ok: true,
      kind: 'none',
      message: `wait ms=${ms}`
    };
  }
  if (action.type === 'toggle_radio') {
    const ok = await DeviceControl.toggleRadio(action.radio, action.enabled);
    return {
      ok,
      kind: 'none',
      message: `toggle_radio radio=${action.radio} enabled=${action.enabled} ok=${ok}`
    };
  }
  if (action.type === 'set_volume') {
    const ok = await DeviceControl.setVolume(action.channel, action.percent);
    return {
      ok,
      kind: 'none',
      message: `set_volume channel=${action.channel} percent=${action.percent} ok=${ok}`
    };
  }
  if (action.type === 'set_brightness') {
    const ok = await DeviceControl.setBrightness(action.percent);
    return {
      ok,
      kind: 'none',
      message: `set_brightness percent=${action.percent} ok=${ok}`
    };
  }
  if (action.type === 'set_dnd') {
    const ok = await DeviceControl.setDndMode(action.enabled);
    return {
      ok,
      kind: 'none',
      message: `set_dnd enabled=${action.enabled} ok=${ok}`
    };
  }
  if (action.type === 'launch_app') {
    try {
      const pkg = await DeviceControl.launchApp(action.app_name);
      return {
        ok: true,
        kind: 'none',
        message: `launch_app app=${action.app_name} package=${pkg}`
      };
    } catch (e: any) {
      return {
        ok: false,
        kind: 'none',
        message: e?.message || 'App launch failed',
        speakHint: `I couldn't find an installed app named "${action.app_name}".`
      };
    }
  }
  if (action.type === 'set_alarm') {
    const ok = await DeviceControl.setAlarm(action.hour, action.minute, action.message);
    return {
      ok,
      kind: 'none',
      message: `set_alarm time=${action.hour}:${action.minute} ok=${ok}`
    };
  }
  if (action.type === 'set_timer') {
    const ok = await DeviceControl.setTimer(action.seconds, action.message);
    return {
      ok,
      kind: 'none',
      message: `set_timer seconds=${action.seconds} ok=${ok}`
    };
  }
  if (action.type === 'dial_call') {
    const ok = await MessagingUtility.dialCall(action.number);
    return {
      ok,
      kind: 'none',
      message: `dial_call number=${action.number} ok=${ok}`
    };
  }
  if (action.type === 'read_notifications') {
    const list = await MessagingUtility.getRecentNotifications();
    return {
      ok: true,
      kind: 'none',
      message: `read_notifications list=${JSON.stringify(list)}`
    };
  }
  if (action.type === 'save_memory') {
    return {
      ok: true,
      kind: 'none',
      message: `save_memory text=${action.text}`
    };
  }
  return {
    ok: false,
    kind: 'none',
    message: `Unsupported action type: ${(action as any).type}`,
  };
}
