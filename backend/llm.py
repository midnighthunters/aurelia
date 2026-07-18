"""
Claude API wrapper.

Never expose ANTHROPIC_API_KEY to the React Native client.
All LLM traffic goes through this module via FastAPI.
"""

from __future__ import annotations

import json
import os
import re
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import anthropic

from action_schema import parse_action

SYSTEM_PROMPT = """You are Aurelia, a calm voice-first AI companion the user wears via Bluetooth earbuds.
You speak briefly — this is audio, not a screen. Prefer 1–3 short sentences unless the user asks for detail.

You have full control of the user's phone using native APIs and Accessibility UI automation.
You can perform actions on the device. To run an action, output a JSON action block in your response.

Always respond with ONLY a single JSON object (no markdown fences) of this shape:
{
  "reply_text": "<what you will say out loud>",
  "action": {
    "type": "<action_type>",
    ...type-specific fields...
  }
}

Actions you can execute:
1) type "none" — speech only:
   {"type": "none"}

2) type "create_calendar_event" — create calendar entries:
   {"type": "create_calendar_event", "title": "Dentist", "start_iso": "2026-07-24T15:00:00-04:00", "end_iso": "2026-07-24T16:00:00-04:00", "notes": "optional description", "all_day": false}

3) type "send_message" — draft sms/whatsapp/emails:
   {"type": "send_message", "channel": "whatsapp" | "sms" | "email", "recipient": "wife", "body": "Hello", "subject": "optional subject"}

4) type "click" — click an accessibility node:
   {"type": "click", "view_id": "optional_id", "text": "optional_text"}

5) type "long_click" — long-press a node:
   {"type": "long_click", "view_id": "optional_id", "text": "optional_text"}

6) type "type_text" — type text in editable field:
   {"type": "type_text", "view_id": "optional_id", "text": "optional_text", "value": "text_to_type"}

7) type "scroll" — scroll screen up/down:
   {"type": "scroll", "direction": "up" | "down"}

8) type "tap_coordinate" — tap screen coordinates:
   {"type": "tap_coordinate", "x": 123.4, "y": 567.8}

9) type "swipe_coordinate" — swipe/drag:
   {"type": "swipe_coordinate", "x1": 100.0, "y1": 500.0, "x2": 100.0, "y2": 200.0, "duration_ms": 300}

10) type "navigate" — system gestures:
    {"type": "navigate", "action": "back" | "home" | "recents" | "notifications"}

11) type "wait" — wait for transitions:
    {"type": "wait", "ms": 1000}

12) type "toggle_radio" — toggle wifi/bluetooth:
    {"type": "toggle_radio", "radio": "wifi" | "bluetooth", "enabled": true}

13) type "set_volume" — modify stream volume:
    {"type": "set_volume", "channel": "music" | "ring" | "notification" | "system", "percent": 0.5}

14) type "set_brightness" — screen brightness:
    {"type": "set_brightness", "percent": 0.5}

15) type "set_dnd" — system do-not-disturb:
    {"type": "set_dnd", "enabled": true}

16) type "launch_app" — open any installed app by name:
    {"type": "launch_app", "app_name": "whatsapp"}

17) type "set_alarm" — configure alarms:
    {"type": "set_alarm", "hour": 8, "minute": 30, "message": "wake up"}

18) type "set_timer" — configure timers (seconds):
    {"type": "set_timer", "seconds": 300, "message": "tea"}

19) type "dial_call" — initiate calls:
    {"type": "dial_call", "number": "123456789"}

20) type "read_notifications" — get recent active statusbar notifications:
    {"type": "read_notifications"}

21) type "save_memory" — store permanent user facts/preferences:
    {"type": "save_memory", "text": "The user prefers text messages over phone calls."}

Planning Guidelines:
- If a task requires multiple steps, output the first step action (e.g. launch_app). You will receive the layout results back in the next turn and can decide the next action.
- Resolve relative phrases like "Thursday at 3pm" using CLIENT_NOW and CLIENT_TIMEZONE.
- Never invent phone numbers or emails not provided by the user, RELATIONSHIPS, or LONG_TERM_USER_MEMORIES.
"""


def _client() -> anthropic.Anthropic:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not set. Copy backend/.env.example to backend/.env and add your key."
        )
    return anthropic.Anthropic(api_key=api_key)


def _model() -> str:
    return os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-20250514")


def _build_system(
    client_now_iso: str,
    client_timezone: str,
    quiet_mode: bool,
    relationships: dict[str, str],
) -> str:
    from memory_rag import get_rag_context

    memories = get_rag_context()
    rel_lines = (
        "\n".join(f"  - {k}: {v}" for k, v in relationships.items())
        if relationships
        else "  (none configured)"
    )
    return (
        f"{SYSTEM_PROMPT}\n\n"
        f"CLIENT_NOW: {client_now_iso}\n"
        f"CLIENT_TIMEZONE: {client_timezone}\n"
        f"QUIET_MODE: {str(quiet_mode).lower()}\n"
        f"RELATIONSHIPS:\n{rel_lines}\n\n"
        f"LONG_TERM_USER_MEMORIES:\n{memories}\n"
    )


def _extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    # Strip accidental markdown fences
    fence = re.match(r"^```(?:json)?\s*([\s\S]*?)\s*```$", text)
    if fence:
        text = fence.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Best-effort: find first {...} block
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                pass
        return {"reply_text": text, "action": {"type": "none"}}


def _fallback_calendar_resolution(
    action: dict[str, Any],
    client_now_iso: str,
    client_timezone: str,
) -> dict[str, Any]:
    """
    If the model returned a calendar action without usable ISO timestamps,
    leave as-is for the client to reject; if start is present but end missing,
    default +1h.
    """
    if action.get("type") != "create_calendar_event":
        return action
    start = action.get("start_iso") or ""
    end = action.get("end_iso") or ""
    if start and not end:
        try:
            tz = ZoneInfo(client_timezone) if client_timezone else None
            dt = datetime.fromisoformat(start.replace("Z", "+00:00"))
            if dt.tzinfo is None and tz is not None:
                dt = dt.replace(tzinfo=tz)
            action["end_iso"] = (dt + timedelta(hours=1)).isoformat()
        except Exception:
            pass
    return action


def generate_reply(
    transcript: str,
    history: list[dict[str, str]],
    client_now_iso: str,
    client_timezone: str,
    quiet_mode: bool = False,
    relationships: dict[str, str] | None = None,
    screen_base64: str | None = None,
) -> tuple[str, dict[str, Any]]:
    """
    Returns (reply_text, action_dict).
    On missing API key or API failure, returns a graceful spoken error with no action.
    """
    relationships = relationships or {}
    messages: list[dict[str, Any]] = []
    for turn in history:
        role = turn.get("role", "user")
        if role not in ("user", "assistant"):
            continue
        content = turn.get("content", "")
        if content:
            messages.append({"role": role, "content": content})

    user_content: list[dict[str, Any]] = []
    if screen_base64:
        user_content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/jpeg",
                "data": screen_base64
            }
        })
    user_content.append({
        "type": "text",
        "text": transcript if transcript.strip() else "Please evaluate the last action result and decide the next step."
    })
    messages.append({"role": "user", "content": user_content})

    system = _build_system(client_now_iso, client_timezone, quiet_mode, relationships)

    try:
        client = _client()
        response = client.messages.create(
            model=_model(),
            max_tokens=1024,
            system=system,
            messages=messages,
        )
        raw_text = "".join(
            block.text for block in response.content if getattr(block, "type", None) == "text"
        )
        parsed = _extract_json(raw_text)
        reply_text = str(parsed.get("reply_text") or "").strip() or "Sorry, I didn't catch that."
        action = parse_action(parsed.get("action"))
        action = _fallback_calendar_resolution(action, client_now_iso, client_timezone)
        return reply_text, action
    except Exception as exc:  # noqa: BLE001 — surface as spoken error for MVP
        return (
            f"I hit a brain error and can't answer right now. ({type(exc).__name__})",
            {"type": "none"},
        )


def generate_check_in_prompt() -> str:
    """Lightweight proactive check-in line for the scheduler."""
    return "Hey — just checking in. How's it going?"
