"""
Auth Service: JWT token management + password hashing.

- Access tokens: short-lived (24h), used on every request.
- Refresh tokens: long-lived (30d), used to get new access tokens.
- Passwords: hashed with bcrypt via passlib.
"""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.user import User

settings = get_settings()

# bcrypt context (auto-selects best available scheme)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# A pre-computed dummy hash used to keep login timing constant when the user
# does not exist (mitigates username-enumeration via timing).
_DUMMY_HASH = pwd_context.hash("dummy-password-for-constant-time-compare")


class UserAlreadyExists(Exception):
    """Raised when a username/email uniqueness constraint is violated."""

ALGORITHM = settings.ALGORITHM
SECRET_KEY = settings.SECRET_KEY


# ─── Password Hashing ─────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ─── Token Generation ─────────────────────────────────────────────────────────

def _create_token(data: dict, expires_delta: timedelta) -> str:
    payload = data.copy()
    expire = datetime.now(timezone.utc) + expires_delta
    payload.update({"exp": expire, "iat": datetime.now(timezone.utc)})
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_access_token(user_id: uuid.UUID, username: str) -> str:
    return _create_token(
        data={"sub": str(user_id), "username": username, "type": "access"},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )


def create_refresh_token(user_id: uuid.UUID) -> str:
    return _create_token(
        data={"sub": str(user_id), "type": "refresh"},
        expires_delta=timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )


# ─── Token Validation ─────────────────────────────────────────────────────────

def decode_access_token(token: str) -> Optional[dict]:
    """Returns payload dict or None if token is invalid/expired."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "access":
            return None
        return payload
    except JWTError:
        return None


def decode_refresh_token(token: str) -> Optional[str]:
    """Returns user_id string or None if token is invalid/expired."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "refresh":
            return None
        return payload.get("sub")
    except JWTError:
        return None


# ─── DB Helpers ───────────────────────────────────────────────────────────────

async def get_user_by_username(db: AsyncSession, username: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.username == username))
    return result.scalar_one_or_none()

async def get_leaderboard(db: AsyncSession, mode: str = "rapid", limit: int = 50):
    """Get the top players ordered by their ELO in the given mode."""
    if mode == "blitz":
        order_col = User.elo_blitz
    elif mode == "bullet":
        order_col = User.elo_bullet
    else:
        order_col = User.elo_rapid
        
    result = await db.execute(
        select(User)
        .where(User.is_active == True)
        .order_by(order_col.desc())
        .limit(limit)
    )
    return result.scalars().all()


async def get_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> Optional[User]:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def authenticate_user(db: AsyncSession, username: str, password: str) -> Optional[User]:
    user = await get_user_by_username(db, username)
    if not user:
        # Verify against a dummy hash so response time doesn't reveal whether
        # the username exists.
        verify_password(password, _DUMMY_HASH)
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


async def create_user(db: AsyncSession, username: str, email: str, password: str) -> User:
    user = User(
        username=username,
        email=email,
        password_hash=hash_password(password),
    )
    db.add(user)
    try:
        await db.commit()
    except IntegrityError:
        # Concurrent registration won the race on username/email uniqueness.
        await db.rollback()
        raise UserAlreadyExists()
    await db.refresh(user)
    return user
