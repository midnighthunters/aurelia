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
    PASTE_TEXT = "paste_text"
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
    ASK_CLARIFICATION = "ask_clarification"
    COMPOSE_EMAIL = "compose_email"
    SEARCH_WEB = "search_web"
    JOB_SEARCH = "job_search"
    MEDIA_CONTROL = "media_control"
    CONTACT_ACTION = "contact_action"
    CONFIRM_ACTION = "confirm_action"
    INSTA_SCROLL = "insta_scroll"


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


class AskClarificationAction(BaseModel):
    type: Literal["ask_clarification"] = "ask_clarification"
    question: str


class ComposeEmailAction(BaseModel):
    type: Literal["compose_email"] = "compose_email"
    to: str
    subject: str = ""
    body: str = ""
    cc: Optional[str] = None
    bcc: Optional[str] = None
    attachment_path: Optional[str] = None


class SearchWebAction(BaseModel):
    type: Literal["search_web"] = "search_web"
    query: str
    url: Optional[str] = None


class JobSearchAction(BaseModel):
    type: Literal["job_search"] = "job_search"
    platform: str = "linkedin"  # linkedin | indeed | naukri
    keywords: str
    location: str = ""
    remote: bool = False


class MediaControlAction(BaseModel):
    type: Literal["media_control"] = "media_control"
    action: str = "play_pause"  # play_pause | play | pause | next | previous | search
    query: Optional[str] = None


class ContactAction(BaseModel):
    type: Literal["contact_action"] = "contact_action"
    action: str = "search"  # search | add | edit | share
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None


class ConfirmAction(BaseModel):
    type: Literal["confirm_action"] = "confirm_action"
    description: str
    pending_action: dict[str, Any]


class PasteTextAction(BaseModel):
    type: Literal["paste_text"] = "paste_text"
    view_id: Optional[str] = None
    text: Optional[str] = None


class InstaScrollAction(BaseModel):
    type: Literal["insta_scroll"] = "insta_scroll"
    interval_sec: int = 5
    count: int = 10


class NoAction(BaseModel):
    type: Literal["none"] = "none"


def parse_action(raw: dict[str, Any] | None) -> dict[str, Any]:
    """Normalize LLM/tool JSON into a safe action dict the client understands."""
    if not raw or not isinstance(raw, dict):
        return {"type": ActionType.NONE.value}

    action_type = str(raw.get("type", "none")).lower().strip()

    if action_type == ActionType.INSTA_SCROLL.value:
        return InstaScrollAction(
            interval_sec=int(raw.get("interval_sec") or 5),
            count=int(raw.get("count") or 10),
        ).model_dump(mode="json")

    if action_type == ActionType.ASK_CLARIFICATION.value:
        return AskClarificationAction(
            question=str(raw.get("question") or "Could you clarify what you'd like me to do?"),
        ).model_dump(mode="json")

    if action_type == ActionType.COMPOSE_EMAIL.value:
        return ComposeEmailAction(
            to=str(raw.get("to") or ""),
            subject=str(raw.get("subject") or ""),
            body=str(raw.get("body") or ""),
            cc=raw.get("cc"),
            bcc=raw.get("bcc"),
            attachment_path=raw.get("attachment_path"),
        ).model_dump(mode="json")

    if action_type == ActionType.SEARCH_WEB.value:
        return SearchWebAction(
            query=str(raw.get("query") or ""),
            url=raw.get("url"),
        ).model_dump(mode="json")

    if action_type == ActionType.JOB_SEARCH.value:
        return JobSearchAction(
            platform=str(raw.get("platform") or "linkedin"),
            keywords=str(raw.get("keywords") or ""),
            location=str(raw.get("location") or ""),
            remote=bool(raw.get("remote", False)),
        ).model_dump(mode="json")

    if action_type == ActionType.MEDIA_CONTROL.value:
        return MediaControlAction(
            action=str(raw.get("action") or "play_pause"),
            query=raw.get("query"),
        ).model_dump(mode="json")

    if action_type == ActionType.CONTACT_ACTION.value:
        return ContactAction(
            action=str(raw.get("action") or "search"),
            name=str(raw.get("name") or ""),
            phone=raw.get("phone"),
            email=raw.get("email"),
        ).model_dump(mode="json")

    if action_type == ActionType.CONFIRM_ACTION.value:
        return ConfirmAction(
            description=str(raw.get("description") or "Confirm this action"),
            pending_action=raw.get("pending_action") or {"type": "none"},
        ).model_dump(mode="json")

    if action_type == ActionType.PASTE_TEXT.value:
        return PasteTextAction(
            view_id=raw.get("view_id"),
            text=raw.get("text"),
        ).model_dump(mode="json")

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
