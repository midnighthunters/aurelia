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
  return {
    ok: false,
    kind: 'none',
    message: `Unsupported action type: ${(action as any).type}`,
  };
}
