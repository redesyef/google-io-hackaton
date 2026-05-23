"""Chat endpoint — stub for Phase 0. Fully wired in Phase 2."""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from core.security import current_user
from core.session_store import store

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatRequest(BaseModel):
    message: str


@router.post("/message")
def send_message(
    payload: ChatRequest,
    user: str = Depends(current_user),
) -> dict[str, str]:
    session = store.get_or_create(user)
    if not session.gcp_credentials:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GCP credentials not configured",
        )
    # Phase 2 will replace this with the Managed Agents orchestrator.
    return {
        "reply": f"(stub) received: {payload.message[:120]}",
        "project_id": session.gcp_project_id or "",
    }
