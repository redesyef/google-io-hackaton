"""Apply / discard proposed changes from the diagram.

The deploy sub-agent surfaces 'proposed' nodes via diagram_update.
The user can confirm them, at which point we (would) call the real
GCP API to provision the resource. For the hackathon we mark the node
as 'RUNNING' so the canvas reflects the deployment, but we do not
actually mutate the real cloud — that's a stretch goal.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from core.security import current_user
from core.session_store import store

router = APIRouter(prefix="/diagram", tags=["diagram"])


class ApplyRequest(BaseModel):
    node_id: str


@router.post("/apply")
def apply_proposal(
    payload: ApplyRequest,
    user: str = Depends(current_user),
) -> dict[str, Any]:
    session = store.get_or_create(user)
    if not session.gcp_credentials:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="no gcp session")

    # In the demo / hackathon path we just acknowledge the apply and let the
    # client mark the node as RUNNING. A real implementation would route
    # through a deployer (Terraform / Deployment Manager / Pulumi / direct API).
    return {
        "ok": True,
        "node_id": payload.node_id,
        "status": "RUNNING",
        "message": (
            "Proposal acknowledged. In a production build this would invoke "
            "the deploy sub-agent's apply path against the GCP API."
        ),
    }


@router.post("/discard")
def discard_proposal(
    payload: ApplyRequest,
    user: str = Depends(current_user),
) -> dict[str, Any]:
    return {"ok": True, "node_id": payload.node_id}
