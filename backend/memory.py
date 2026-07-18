"""
Session memory handling for the backend.

MVP policy (masterplan):
  - Short-term only
  - Client is the durable source of truth (AsyncStorage / in-memory session)
  - Backend keeps a lightweight in-process cache keyed by session_id so multi-turn
    context works even if the client sends a truncated history
  - Cleared when earbuds disconnect (client drops the session_id and calls clear)

Long-term / cross-session memory is Phase 2+ and intentionally absent here.
"""

from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass, field
from threading import Lock
from typing import Deque


MAX_TURNS_PER_SESSION = 40


@dataclass
class Turn:
    role: str  # "user" | "assistant"
    content: str


@dataclass
class SessionMemory:
    session_id: str
    turns: Deque[Turn] = field(default_factory=lambda: deque(maxlen=MAX_TURNS_PER_SESSION))


class MemoryStore:
    def __init__(self) -> None:
        self._sessions: dict[str, SessionMemory] = {}
        self._lock = Lock()

    def get_or_create(self, session_id: str) -> SessionMemory:
        with self._lock:
            if session_id not in self._sessions:
                self._sessions[session_id] = SessionMemory(session_id=session_id)
            return self._sessions[session_id]

    def merge_history(self, session_id: str, history: list[dict[str, str]]) -> list[dict[str, str]]:
        """
        Prefer client-provided history when present; otherwise fall back to server cache.
        Always returns a list of {role, content} dicts suitable for the LLM.
        """
        session = self.get_or_create(session_id)
        if history:
            with self._lock:
                session.turns.clear()
                for item in history[-MAX_TURNS_PER_SESSION:]:
                    role = item.get("role", "user")
                    content = item.get("content", "")
                    if content:
                        session.turns.append(Turn(role=role, content=content))
        return [{"role": t.role, "content": t.content} for t in session.turns]

    def append(self, session_id: str, role: str, content: str) -> None:
        if not content:
            return
        session = self.get_or_create(session_id)
        with self._lock:
            session.turns.append(Turn(role=role, content=content))

    def clear(self, session_id: str) -> None:
        with self._lock:
            self._sessions.pop(session_id, None)

    def clear_all(self) -> None:
        with self._lock:
            self._sessions.clear()


# Process-wide store (single-instance MVP). For multi-worker deploy, move to Redis later.
store = MemoryStore()
