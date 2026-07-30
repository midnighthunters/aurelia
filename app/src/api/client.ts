/**
 * Client for the FastAPI brain.
 * All LLM calls go through this — never embed Anthropic keys in the app.
 */

import {CONFIG} from '../config';

export type HistoryTurn = {role: 'user' | 'assistant'; content: string};

export type ActionPayload =
  | {type: 'none'}
  | {
      type: 'ask_clarification';
      question: string;
    }
  | {
      type: 'compose_email';
      to: string;
      subject: string;
      body: string;
      cc?: string | null;
      bcc?: string | null;
      attachment_path?: string | null;
    }
  | {
      type: 'search_web';
      query: string;
      url?: string | null;
    }
  | {
      type: 'job_search';
      platform?: string;
      keywords: string;
      location?: string;
      remote?: boolean;
    }
  | {
      type: 'media_control';
      action: string;
      query?: string | null;
    }
  | {
      type: 'contact_action';
      action: string;
      name: string;
      phone?: string | null;
      email?: string | null;
    }
  | {
      type: 'confirm_action';
      description: string;
      pending_action: any;
    }
  | {
      type: 'paste_text';
      view_id?: string | null;
      text?: string | null;
    }
  | {
      type: 'insta_scroll';
      interval_sec?: number;
      count?: number;
    }
  | {
      type: 'create_calendar_event';
      title: string;
      start_iso: string;
      end_iso: string;
      notes?: string | null;
      all_day?: boolean;
    }
  | {
      type: 'send_message';
      channel: 'whatsapp' | 'sms' | 'email';
      recipient: string;
      body: string;
      subject?: string | null;
    }
  | {
      type: 'click';
      view_id?: string | null;
      text?: string | null;
    }
  | {
      type: 'long_click';
      view_id?: string | null;
      text?: string | null;
    }
  | {
      type: 'type_text';
      view_id?: string | null;
      text?: string | null;
      value: string;
    }
  | {
      type: 'scroll';
      direction: 'up' | 'down';
    }
  | {
      type: 'tap_coordinate';
      x: number;
      y: number;
    }
  | {
      type: 'swipe_coordinate';
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      duration_ms?: number;
    }
  | {
      type: 'navigate';
      action: 'back' | 'home' | 'recents' | 'notifications';
    }
  | {
      type: 'wait';
      ms?: number;
    }
  | {
      type: 'toggle_radio';
      radio: 'wifi' | 'bluetooth';
      enabled: boolean;
    }
  | {
      type: 'set_volume';
      channel: 'music' | 'ring' | 'notification' | 'system';
      percent: number;
    }
  | {
      type: 'set_brightness';
      percent: number;
    }
  | {
      type: 'set_dnd';
      enabled: boolean;
    }
  | {
      type: 'launch_app';
      app_name: string;
    }
  | {
      type: 'set_alarm';
      hour: number;
      minute: number;
      message: string;
    }
  | {
      type: 'set_timer';
      seconds: number;
      message: string;
    }
  | {
      type: 'dial_call';
      number: string;
    }
  | {
      type: 'read_notifications';
    }
  | {
      type: 'save_memory';
      text: string;
    };

export async function sendReplyTurn(
  transcript: string,
  sessionId: string,
  history: HistoryTurn[] = [],
  quietMode = false,
  relationships: Record<string, string> = {}
): Promise<ReplyResponse> {
  return requestReply({
    transcript,
    session_id: sessionId,
    history,
    client_now_iso: clientNowIso(),
    client_timezone: getClientTimezone(),
    quiet_mode: quietMode,
    relationships,
  });
}

export type ReplyResponse = {
  reply_text: string;
  action: ActionPayload;
  session_id: string;
};

export type ReplyRequest = {
  transcript: string;
  session_id: string;
  history: HistoryTurn[];
  client_now_iso: string;
  client_timezone: string;
  quiet_mode: boolean;
  relationships: Record<string, string>;
};

function baseUrl(): string {
  return CONFIG.backendBaseUrl.replace(/\/$/, '');
}

export async function healthCheck(): Promise<{
  status: string;
  has_api_key: boolean;
  model: string;
}> {
  const res = await fetch(`${baseUrl()}/health`);
  if (!res.ok) {
    throw new Error(`health ${res.status}`);
  }
  return res.json();
}

export async function requestReply(body: ReplyRequest): Promise<ReplyResponse> {
  const res = await fetch(`${baseUrl()}/reply`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`/reply ${res.status}: ${text}`);
  }
  return res.json();
}

export async function clearServerSession(sessionId: string): Promise<void> {
  await fetch(`${baseUrl()}/session/clear`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({session_id: sessionId}),
  });
}

export async function fetchCheckInPrompt(): Promise<string> {
  try {
    const res = await fetch(`${baseUrl()}/check-in-prompt`);
    if (!res.ok) {
      return "Hey — just checking in. How's it going?";
    }
    const data = await res.json();
    return data.prompt || "Hey — just checking in. How's it going?";
  } catch {
    return "Hey — just checking in. How's it going?";
  }
}

/** Best-effort IANA timezone; falls back to offset string. */
export function getClientTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || offsetTimezone();
  } catch {
    return offsetTimezone();
  }
}

function offsetTimezone(): string {
  const offsetMin = -new Date().getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const h = String(Math.floor(abs / 60)).padStart(2, '0');
  const m = String(abs % 60).padStart(2, '0');
  return `UTC${sign}${h}:${m}`;
}

export function clientNowIso(): string {
  return new Date().toISOString();
}
