"""In-memory session store for GCP credentials and chat history.

Credentials are kept ONLY in process memory, keyed by JWT subject.
Never persisted to disk. Cleared on logout or process restart.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from threading import RLock
from typing import Any


@dataclass
class UserSession:
    user_id: str
    gcp_credentials: dict[str, Any] | None = None
    gcp_project_id: str | None = None
    gcp_region: str = "us-central1"
    chat_history: list[dict[str, Any]] = field(default_factory=list)
    diagram_state: dict[str, Any] = field(default_factory=lambda: {"nodes": [], "edges": []})


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, UserSession] = {}
        self._lock = RLock()

    def get_or_create(self, user_id: str) -> UserSession:
        with self._lock:
            if user_id not in self._sessions:
                self._sessions[user_id] = UserSession(user_id=user_id)
            return self._sessions[user_id]

    def get(self, user_id: str) -> UserSession | None:
        with self._lock:
            return self._sessions.get(user_id)

    def clear(self, user_id: str) -> None:
        with self._lock:
            self._sessions.pop(user_id, None)


store = SessionStore()
