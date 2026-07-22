"""
Auth router: /auth/register, /auth/login, /auth/refresh, /auth/me

Security pattern:
  - Access token is returned in JSON body (stored in memory by client).
  - Refresh token is set as HttpOnly cookie (CSRF-safe) AND returned in body.
"""
import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Cookie
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.database import get_db
from app.schemas.auth import (
    RegisterRequest, LoginRequest, TokenResponse,
    RefreshRequest, UserPublic, UserMe
)
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login-form")


# ─── Dependency: Get Current User ─────────────────────────────────────────────

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = auth_service.decode_access_token(token)
    if payload is None:
        raise credentials_exception

    user_id_str: str = payload.get("sub")
    if user_id_str is None:
        raise credentials_exception

    user = await auth_service.get_user_by_id(db, uuid.UUID(user_id_str))
    if user is None or not user.is_active:
        raise credentials_exception

    return user


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register a new user. Returns access + refresh tokens immediately."""
    # Check uniqueness
    if await auth_service.get_user_by_username(db, body.username):
        raise HTTPException(400, "Username already taken")
    if await auth_service.get_user_by_email(db, body.email):
        raise HTTPException(400, "Email already registered")

    user = await auth_service.create_user(db, body.username, body.email, body.password)
    return TokenResponse(
        access_token=auth_service.create_access_token(user.id, user.username),
        refresh_token=auth_service.create_refresh_token(user.id),
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Login with username + password. Returns access + refresh tokens."""
    user = await auth_service.authenticate_user(db, body.username, body.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )
    return TokenResponse(
        access_token=auth_service.create_access_token(user.id, user.username),
        refresh_token=auth_service.create_refresh_token(user.id),
    )


@router.post("/login-form", response_model=TokenResponse, include_in_schema=False)
async def login_form(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    """OAuth2 form-compatible login endpoint (for Swagger UI)."""
    user = await auth_service.authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    return TokenResponse(
        access_token=auth_service.create_access_token(user.id, user.username),
        refresh_token=auth_service.create_refresh_token(user.id),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    """Get a new access token using a valid refresh token."""
    user_id_str = auth_service.decode_refresh_token(body.refresh_token)
    if not user_id_str:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    user = await auth_service.get_user_by_id(db, uuid.UUID(user_id_str))
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found")

    return TokenResponse(
        access_token=auth_service.create_access_token(user.id, user.username),
        refresh_token=auth_service.create_refresh_token(user.id),
    )


@router.get("/me", response_model=UserMe)
async def get_me(current_user=Depends(get_current_user)):
    """Return the currently authenticated user's profile."""
    return current_user


@router.get("/users/{username}", response_model=UserPublic)
async def get_user_profile(username: str, db: AsyncSession = Depends(get_db)):
    """Get a public profile by username."""
    user = await auth_service.get_user_by_username(db, username)
    if not user:
        raise HTTPException(404, "User not found")
    return user
