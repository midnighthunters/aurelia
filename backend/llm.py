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

You can also request device actions. When the user wants you to:
- create a calendar event / appointment / reminder on their phone calendar
- text / WhatsApp / email / SMS someone

…return a JSON action in addition to your spoken reply.

Always respond with ONLY a single JSON object (no markdown fences) of this shape:
{
  "reply_text": "<what you will say out loud>",
  "action": {
    "type": "none" | "create_calendar_event" | "send_message",
    ...type-specific fields...
  }
}

Action schemas:
1) type "none" — speech only:
   {"type": "none"}

2) type "create_calendar_event":
   {
     "type": "create_calendar_event",
     "title": "Dentist",
     "start_iso": "2026-07-24T15:00:00-04:00",
     "end_iso": "2026-07-24T16:00:00-04:00",
     "notes": "optional",
     "all_day": false
   }
   Resolve relative phrases like "Thursday at 3pm" using CLIENT_NOW and CLIENT_TIMEZONE.
   Default duration is 1 hour if the user does not specify an end time.

3) type "send_message":
   {
     "type": "send_message",
     "channel": "whatsapp" | "sms" | "email",
     "recipient": "<relationship alias or phone/email as spoken>",
     "body": "<message body>",
     "subject": "<email subject only, optional>"
   }
   Prefer channel "whatsapp" when the user says text/message without specifying SMS/email.
   Use relationship aliases from RELATIONSHIPS when available (e.g. "wife").
   The phone will OPEN the app pre-filled; the user must tap send. Say so briefly in reply_text
   (e.g. "I've opened WhatsApp with the message ready — just hit send.").

Quiet mode: if QUIET_MODE is true, do not suggest proactive check-ins; still answer direct requests.

Never invent phone numbers or emails not provided by the user or RELATIONSHIPS.
If you cannot resolve a recipient, ask a short clarifying question with action.type "none".
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
        f"RELATIONSHIPS:\n{rel_lines}\n"
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
    messages.append({"role": "user", "content": transcript})

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
