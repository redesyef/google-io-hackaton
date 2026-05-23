"""Chat endpoint with SSE streaming.

The orchestrator (Phase 2) yields typed events that the frontend uses to
update both the chat transcript AND the live diagram in real time.

Event types:
  - status         : { text }
  - agent_start    : { agent }
  - agent_end      : { agent }
  - tool_call      : { agent, tool, args }
  - tool_result    : { agent, tool, summary }
  - diagram_update : { nodes_add?, nodes_update?, edges_add?, highlight? }
  - message_chunk  : { text }
  - done           : { full_text }
  - error          : { message }
"""
from __future__ import annotations

import json
from collections.abc import AsyncGenerator
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from core.security import current_user, decode_token
from core.session_store import store
from mcp.gcp_client import build_client

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatRequest(BaseModel):
    message: str


def _user_from_query_or_cookie(request: Request) -> str:
    """SSE in browsers can't send custom headers reliably from EventSource;
    fall back to the cookie or an explicit ?token= query param."""
    token = request.cookies.get("access_token") or request.query_params.get("token")
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="not authenticated")
    return decode_token(token)


def _sse(event_type: str, data: dict[str, Any]) -> dict[str, str]:
    return {"event": event_type, "data": json.dumps(data)}


async def _run_orchestrator(user: str, message: str) -> AsyncGenerator[dict[str, str], None]:
    """Phase 1 stub. Phase 2 replaces this with the real Managed Agents pipeline."""
    session = store.get_or_create(user)
    try:
        client = build_client(session.gcp_credentials, session.gcp_project_id, session.gcp_region)
    except ValueError as exc:
        yield _sse("error", {"message": str(exc)})
        return

    yield _sse("status", {"text": "Orchestrator received message…"})
    yield _sse("agent_start", {"agent": "inventory"})
    snapshot = client.snapshot()
    yield _sse("tool_call", {"agent": "inventory", "tool": "snapshot", "args": {}})
    yield _sse("tool_result", {"agent": "inventory", "tool": "snapshot", "summary": f"{len(snapshot['compute'])} VMs, {len(snapshot['storage'])} buckets"})
    yield _sse("agent_end", {"agent": "inventory"})

    reply = (
        f"(stub orchestrator) You said: {message!r}. "
        f"I can see {len(snapshot['compute'])} compute instances "
        f"and {len(snapshot['storage'])} buckets in {snapshot['project_id']}."
    )
    for chunk in reply.split(" "):
        yield _sse("message_chunk", {"text": chunk + " "})
    yield _sse("done", {"full_text": reply})


@router.post("/message")
def send_message(
    payload: ChatRequest,
    user: str = Depends(current_user),
) -> dict[str, str]:
    """Non-streaming fallback. The frontend prefers /chat/stream."""
    session = store.get_or_create(user)
    if not session.gcp_credentials:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="GCP credentials not configured")
    return {"reply": f"(non-streaming stub) {payload.message[:120]}", "project_id": session.gcp_project_id or ""}


@router.get("/stream")
async def stream(message: str, request: Request) -> EventSourceResponse:
    user = _user_from_query_or_cookie(request)
    return EventSourceResponse(_run_orchestrator(user, message))
