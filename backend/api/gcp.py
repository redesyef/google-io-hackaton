"""GCP credentials setup + project listing.

Credentials are received as the raw Service Account JSON dict and stored
in memory only. We do not write them to disk.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from core.security import current_user
from core.session_store import store
from mcp.gcp_client import DemoGcpClient, RealGcpClient, build_client

router = APIRouter(prefix="/gcp", tags=["gcp"])


class CredentialsRequest(BaseModel):
    service_account_json: dict[str, Any] | None = None
    demo_mode: bool = False


class CredentialsResponse(BaseModel):
    ok: bool
    mode: str  # "real" | "demo"
    project_id: str | None = None
    available_projects: list[dict[str, str]] = []


class SelectProjectRequest(BaseModel):
    project_id: str
    region: str = "us-central1"


@router.post("/credentials", response_model=CredentialsResponse)
def set_credentials(
    payload: CredentialsRequest,
    user: str = Depends(current_user),
) -> CredentialsResponse:
    session = store.get_or_create(user)

    if payload.demo_mode:
        demo = DemoGcpClient()
        session.gcp_credentials = {"_demo": True}
        session.gcp_project_id = demo.project_id
        session.gcp_region = demo.region
        return CredentialsResponse(
            ok=True,
            mode="demo",
            project_id=demo.project_id,
            available_projects=demo.list_projects(),
        )

    if not payload.service_account_json:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="service_account_json is required when demo_mode is false",
        )

    sa = payload.service_account_json
    required = {"type", "project_id", "private_key", "client_email"}
    missing = required - sa.keys()
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"service account JSON missing fields: {sorted(missing)}",
        )

    try:
        client = RealGcpClient(sa, project_id=sa["project_id"])
        projects = client.list_projects()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"failed to authenticate with GCP: {exc.__class__.__name__}: {exc}",
        ) from exc

    session.gcp_credentials = sa
    session.gcp_project_id = sa["project_id"]

    return CredentialsResponse(
        ok=True,
        mode="real",
        project_id=sa["project_id"],
        available_projects=projects,
    )


@router.post("/project")
def select_project(
    payload: SelectProjectRequest,
    user: str = Depends(current_user),
) -> dict[str, str]:
    session = store.get_or_create(user)
    if not session.gcp_credentials:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="set credentials first",
        )
    session.gcp_project_id = payload.project_id
    session.gcp_region = payload.region
    session.diagram_state = {"nodes": [], "edges": []}
    return {"project_id": payload.project_id, "region": payload.region}


@router.get("/status")
def status_(user: str = Depends(current_user)) -> dict[str, Any]:
    session = store.get_or_create(user)
    has_creds = session.gcp_credentials is not None
    mode = None
    if has_creds:
        mode = "demo" if session.gcp_credentials.get("_demo") else "real"
    return {
        "configured": has_creds,
        "mode": mode,
        "project_id": session.gcp_project_id,
        "region": session.gcp_region,
    }


@router.get("/snapshot")
def snapshot(user: str = Depends(current_user)) -> dict[str, Any]:
    """Full inventory snapshot — used by the frontend to seed the diagram."""
    session = store.get_or_create(user)
    try:
        client = build_client(session.gcp_credentials, session.gcp_project_id, session.gcp_region)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return client.snapshot()
