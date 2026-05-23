from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel

from core.config import settings
from core.security import create_access_token
from core.session_store import store

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    user: str


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, response: Response) -> LoginResponse:
    if payload.username != settings.demo_user or payload.password != settings.demo_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid credentials",
        )
    token = create_access_token(payload.username)
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=settings.jwt_expire_minutes * 60,
    )
    store.get_or_create(payload.username)
    return LoginResponse(access_token=token, user=payload.username)


@router.post("/logout")
def logout(response: Response) -> dict[str, bool]:
    response.delete_cookie("access_token")
    return {"ok": True}
