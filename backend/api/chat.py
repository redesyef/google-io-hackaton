"""Chat endpoint with SSE streaming.

The orchestrator yields typed events that the frontend uses to update both
the chat transcript AND the live diagram in real time.
"""
from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from agents.gemini_backend import GeminiBackend
from agents.orchestrator import run_orchestrator, serialize_event
from core.security import current_user, decode_token
from core.session_store import store
from mcp.gcp_client import build_client

router = APIRouter(prefix="/chat", tags=["chat"])

_gemini = GeminiBackend()


class ChatRequest(BaseModel):
    message: str


def _user_from_query_or_cookie(request: Request) -> str:
    token = request.cookies.get("access_token") or request.query_params.get("token")
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="not authenticated")
    return decode_token(token)


async def _event_stream(user: str, message: str) -> AsyncGenerator[dict[str, str], None]:
    session = store.get_or_create(user)
    try:
        gcp = build_client(session.gcp_credentials, session.gcp_project_id, session.gcp_region)
    except ValueError as exc:
        yield serialize_event({"event": "error", "data": {"message": str(exc)}})
        return

    session.chat_history.append({"role": "user", "content": message})

    final_text = ""
    try:
        async for evt in run_orchestrator(
            user_message=message,
            gcp=gcp,
            gemini=_gemini,
            chat_history=session.chat_history,
        ):
            if evt["event"] == "done":
                final_text = evt["data"].get("full_text", "")
            yield serialize_event(evt)
    except Exception as exc:
        yield serialize_event({"event": "error", "data": {"message": f"orchestrator failed: {exc}"}})
        return

    if final_text:
        session.chat_history.append({"role": "model", "content": final_text})


@router.get("/stream")
async def stream(message: str, request: Request) -> EventSourceResponse:
    user = _user_from_query_or_cookie(request)
    return EventSourceResponse(_event_stream(user, message))


@router.post("/message")
async def send_message(
    payload: ChatRequest,
    user: str = Depends(current_user),
) -> dict[str, str]:
    """Non-streaming fallback for environments that can't use SSE."""
    session = store.get_or_create(user)
    if not session.gcp_credentials:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="GCP credentials not configured")
    try:
        gcp = build_client(session.gcp_credentials, session.gcp_project_id, session.gcp_region)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    session.chat_history.append({"role": "user", "content": payload.message})
    final_text = ""
    async for evt in run_orchestrator(payload.message, gcp, _gemini, session.chat_history):
        if evt["event"] == "done":
            final_text = evt["data"].get("full_text", "")
    if final_text:
        session.chat_history.append({"role": "model", "content": final_text})
    return {"reply": final_text or "(no response)", "project_id": session.gcp_project_id or ""}


@router.delete("/history")
def clear_history(user: str = Depends(current_user)) -> dict[str, bool]:
    session = store.get_or_create(user)
    session.chat_history = []
    return {"ok": True}
