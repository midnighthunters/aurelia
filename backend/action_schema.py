"""
Structured action payloads the backend may return alongside reply text.

Tier 1 only (Phase 1):
  - create_calendar_event  → silent CalendarContract write on device
  - send_message           → open WhatsApp/SMS/email pre-filled (user taps send)
  - none                   → speech only

Tier 2 (accessibility hands-free send) is intentionally not defined here.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class ActionType(str, Enum):
    NONE = "none"
    CREATE_CALENDAR_EVENT = "create_calendar_event"
    SEND_MESSAGE = "send_message"


class MessageChannel(str, Enum):
    WHATSAPP = "whatsapp"
    SMS = "sms"
    EMAIL = "email"


class CalendarEventAction(BaseModel):
    type: Literal["create_calendar_event"] = "create_calendar_event"
    title: str
    # ISO-8601 absolute timestamps resolved on the backend using client timezone
    start_iso: str
    end_iso: str
    notes: Optional[str] = None
    all_day: bool = False


class SendMessageAction(BaseModel):
    type: Literal["send_message"] = "send_message"
    channel: MessageChannel
    # Relationship alias or raw identifier (wife, +15551234567, name@example.com)
    recipient: str
    body: str
    subject: Optional[str] = None  # email only


class NoAction(BaseModel):
    type: Literal["none"] = "none"


ActionPayload = CalendarEventAction | SendMessageAction | NoAction


class ReplyRequest(BaseModel):
    """Client → backend."""

    transcript: str
    session_id: str
    # Recent turns for short-term memory (client is source of truth for MVP)
    history: list[dict[str, str]] = Field(default_factory=list)
    # Client clock context so "Thursday at 3pm" can be resolved without guessing
    client_now_iso: str
    client_timezone: str  # e.g. "America/New_York" or "Asia/Kolkata"
    quiet_mode: bool = False
    # Known relationship aliases for the LLM prompt (name → hint string)
    relationships: dict[str, str] = Field(default_factory=dict)


class ReplyResponse(BaseModel):
    """Backend → client."""

    reply_text: str
    action: dict[str, Any] = Field(default_factory=lambda: {"type": "none"})
    # Echo for client-side memory append
    session_id: str


def parse_action(raw: dict[str, Any] | None) -> dict[str, Any]:
    """Normalize LLM/tool JSON into a safe action dict the client understands."""
    if not raw or not isinstance(raw, dict):
        return {"type": ActionType.NONE.value}

    action_type = str(raw.get("type", "none")).lower().strip()

    if action_type == ActionType.CREATE_CALENDAR_EVENT.value:
        return CalendarEventAction(
            title=str(raw.get("title") or "Untitled"),
            start_iso=str(raw.get("start_iso") or ""),
            end_iso=str(raw.get("end_iso") or ""),
            notes=raw.get("notes"),
            all_day=bool(raw.get("all_day", False)),
        ).model_dump(mode="json")

    if action_type == ActionType.SEND_MESSAGE.value:
        channel = str(raw.get("channel") or "sms").lower()
        if channel not in {c.value for c in MessageChannel}:
            channel = MessageChannel.SMS.value
        return SendMessageAction(
            channel=MessageChannel(channel),
            recipient=str(raw.get("recipient") or ""),
            body=str(raw.get("body") or ""),
            subject=raw.get("subject"),
        ).model_dump(mode="json")

    return {"type": ActionType.NONE.value}
