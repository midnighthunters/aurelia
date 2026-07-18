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
    CLICK = "click"
    LONG_CLICK = "long_click"
    TYPE_TEXT = "type_text"
    SCROLL = "scroll"
    TAP_COORDINATE = "tap_coordinate"
    SWIPE_COORDINATE = "swipe_coordinate"
    NAVIGATE = "navigate"
    WAIT = "wait"
    TOGGLE_RADIO = "toggle_radio"
    SET_VOLUME = "set_volume"
    SET_BRIGHTNESS = "set_brightness"
    SET_DND = "set_dnd"
    LAUNCH_APP = "launch_app"
    SET_ALARM = "set_alarm"
    SET_TIMER = "set_timer"
    DIAL_CALL = "dial_call"
    READ_NOTIFICATIONS = "read_notifications"
    SAVE_MEMORY = "save_memory"


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


class ClickAction(BaseModel):
    type: Literal["click"] = "click"
    view_id: Optional[str] = None
    text: Optional[str] = None


class LongClickAction(BaseModel):
    type: Literal["long_click"] = "long_click"
    view_id: Optional[str] = None
    text: Optional[str] = None


class TypeTextAction(BaseModel):
    type: Literal["type_text"] = "type_text"
    view_id: Optional[str] = None
    text: Optional[str] = None
    value: str


class ScrollAction(BaseModel):
    type: Literal["scroll"] = "scroll"
    direction: str = "down"  # "up" | "down"


class TapCoordinateAction(BaseModel):
    type: Literal["tap_coordinate"] = "tap_coordinate"
    x: float
    y: float


class SwipeCoordinateAction(BaseModel):
    type: Literal["swipe_coordinate"] = "swipe_coordinate"
    x1: float
    y1: float
    x2: float
    y2: float
    duration_ms: int = 300


class NavigateAction(BaseModel):
    type: Literal["navigate"] = "navigate"
    action: str = "back"  # "back" | "home" | "recents" | "notifications"


class ToggleRadioAction(BaseModel):
    type: Literal["toggle_radio"] = "toggle_radio"
    radio: str  # "wifi" | "bluetooth"
    enabled: bool


class SetVolumeAction(BaseModel):
    type: Literal["set_volume"] = "set_volume"
    channel: str = "music"  # "music" | "ring" | "notification" | "system"
    percent: float  # 0.0 to 1.0


class SetBrightnessAction(BaseModel):
    type: Literal["set_brightness"] = "set_brightness"
    percent: float  # 0.0 to 1.0


class SetDndAction(BaseModel):
    type: Literal["set_dnd"] = "set_dnd"
    enabled: bool


class LaunchAppAction(BaseModel):
    type: Literal["launch_app"] = "launch_app"
    app_name: str


class SetAlarmAction(BaseModel):
    type: Literal["set_alarm"] = "set_alarm"
    hour: int
    minute: int
    message: str = "Alarm"


class SetTimerAction(BaseModel):
    type: Literal["set_timer"] = "set_timer"
    seconds: int
    message: str = "Timer"


class DialCallAction(BaseModel):
    type: Literal["dial_call"] = "dial_call"
    number: str


class ReadNotificationsAction(BaseModel):
    type: Literal["read_notifications"] = "read_notifications"


class SaveMemoryAction(BaseModel):
    type: Literal["save_memory"] = "save_memory"
    text: str


class NoAction(BaseModel):
    type: Literal["none"] = "none"


ActionPayload = (
    CalendarEventAction
    | SendMessageAction
    | ClickAction
    | LongClickAction
    | TypeTextAction
    | ScrollAction
    | TapCoordinateAction
    | SwipeCoordinateAction
    | NavigateAction
    | WaitAction
    | ToggleRadioAction
    | SetVolumeAction
    | SetBrightnessAction
    | SetDndAction
    | LaunchAppAction
    | SetAlarmAction
    | SetTimerAction
    | DialCallAction
    | ReadNotificationsAction
    | SaveMemoryAction
    | NoAction
)


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

    if action_type == ActionType.CLICK.value:
        return ClickAction(
            view_id=raw.get("view_id"),
            text=raw.get("text"),
        ).model_dump(mode="json")

    if action_type == ActionType.LONG_CLICK.value:
        return LongClickAction(
            view_id=raw.get("view_id"),
            text=raw.get("text"),
        ).model_dump(mode="json")

    if action_type == ActionType.TYPE_TEXT.value:
        return TypeTextAction(
            view_id=raw.get("view_id"),
            text=raw.get("text"),
            value=str(raw.get("value") or ""),
        ).model_dump(mode="json")

    if action_type == ActionType.SCROLL.value:
        return ScrollAction(
            direction=str(raw.get("direction") or "down"),
        ).model_dump(mode="json")

    if action_type == ActionType.TAP_COORDINATE.value:
        return TapCoordinateAction(
            x=float(raw.get("x") or 0.0),
            y=float(raw.get("y") or 0.0),
        ).model_dump(mode="json")

    if action_type == ActionType.SWIPE_COORDINATE.value:
        return SwipeCoordinateAction(
            x1=float(raw.get("x1") or 0.0),
            y1=float(raw.get("y1") or 0.0),
            x2=float(raw.get("x2") or 0.0),
            y2=float(raw.get("y2") or 0.0),
            duration_ms=int(raw.get("duration_ms") or 300),
        ).model_dump(mode="json")

    if action_type == ActionType.NAVIGATE.value:
        return NavigateAction(
            action=str(raw.get("action") or "back"),
        ).model_dump(mode="json")

    if action_type == ActionType.WAIT.value:
        return WaitAction(
            ms=int(raw.get("ms") or 1000),
        ).model_dump(mode="json")

    if action_type == ActionType.TOGGLE_RADIO.value:
        return ToggleRadioAction(
            radio=str(raw.get("radio") or "wifi"),
            enabled=bool(raw.get("enabled", True)),
        ).model_dump(mode="json")

    if action_type == ActionType.SET_VOLUME.value:
        return SetVolumeAction(
            channel=str(raw.get("channel") or "music"),
            percent=float(raw.get("percent") or 0.5),
        ).model_dump(mode="json")

    if action_type == ActionType.SET_BRIGHTNESS.value:
        return SetBrightnessAction(
            percent=float(raw.get("percent") or 0.5),
        ).model_dump(mode="json")

    if action_type == ActionType.SET_DND.value:
        return SetDndAction(
            enabled=bool(raw.get("enabled", True)),
        ).model_dump(mode="json")

    if action_type == ActionType.LAUNCH_APP.value:
        return LaunchAppAction(
            app_name=str(raw.get("app_name") or ""),
        ).model_dump(mode="json")

    if action_type == ActionType.SET_ALARM.value:
        return SetAlarmAction(
            hour=int(raw.get("hour") or 0),
            minute=int(raw.get("minute") or 0),
            message=str(raw.get("message") or "Alarm"),
        ).model_dump(mode="json")

    if action_type == ActionType.SET_TIMER.value:
        return SetTimerAction(
            seconds=int(raw.get("seconds") or 60),
            message=str(raw.get("message") or "Timer"),
        ).model_dump(mode="json")

    if action_type == ActionType.DIAL_CALL.value:
        return DialCallAction(
            number=str(raw.get("number") or ""),
        ).model_dump(mode="json")

    if action_type == ActionType.READ_NOTIFICATIONS.value:
        return ReadNotificationsAction().model_dump(mode="json")

    if action_type == ActionType.SAVE_MEMORY.value:
        return SaveMemoryAction(
            text=str(raw.get("text") or ""),
        ).model_dump(mode="json")

    return {"type": ActionType.NONE.value}
