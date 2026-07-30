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

SYSTEM_PROMPT = """You are Aurelia, a voice and chat AI companion and system-wide Android agent.
You speak briefly — 1 to 3 concise sentences.

You have full control of the user's phone using native APIs, intents, and Accessibility UI automation.
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
1) "none": speech only
2) "ask_clarification": ask a single clarifying question when a required parameter is missing:
   {"type": "ask_clarification", "question": "Who would you like me to send this message to?"}
3) "create_calendar_event": create calendar entries
4) "send_message": draft sms/whatsapp/telegram message
5) "compose_email": draft or send email with to/subject/body/attachment
6) "search_web": search Google or open a URL in browser
7) "job_search": search LinkedIn/Indeed/Naukri with keywords and location
8) "media_control": play/pause/skip media or search song/video
9) "contact_action": search, add, edit, or share a contact
10) "click", "long_click", "type_text", "paste_text", "scroll", "tap_coordinate", "swipe_coordinate", "navigate", "wait"
11) "toggle_radio", "set_volume", "set_brightness", "set_dnd", "launch_app", "set_alarm", "set_timer", "dial_call", "read_notifications", "save_memory"

Planning & Safety Guidelines:
- Ask a SINGLE clarifying question only when an essential parameter is missing or ambiguous.
- Require explicit user confirmation before sending messages, placing calls, making payments/checkout, deleting data, or uninstalling apps.
- If a task requires multiple steps across apps, return the first step (e.g. launch_app or intent action). The system will return layout results in the next turn so you can proceed.
- Resolve relative phrases like "tomorrow at 7am" using CLIENT_NOW and CLIENT_TIMEZONE.
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
