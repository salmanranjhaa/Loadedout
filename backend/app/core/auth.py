import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select, delete, text
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import get_settings
from app.core.database import async_session
from app.models.user import RefreshToken

logger = logging.getLogger(__name__)

settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)


async def create_refresh_token(data: dict) -> str:
    """I create a refresh token, store it in the DB, and return the JWT."""
    jti = str(uuid.uuid4())
    family = data.get("token_family") or str(uuid.uuid4())
    user_id = int(data["sub"])
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    to_encode = data.copy()
    to_encode.update({"exp": expire, "type": "refresh", "jti": jti, "token_family": family})

    async with async_session() as session:
        await session.execute(
            text(f"SET LOCAL app.current_user_id = {user_id}"),
        )
        token = RefreshToken(
            jti=jti,
            user_id=user_id,
            token_family=family,
            expires_at=expire,
        )
        session.add(token)
        await session.commit()

    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)


async def rotate_refresh_token(old_jti: str, user_id: int) -> str:
    """I invalidate the old refresh token and issue a new one in the same family."""
    async with async_session() as session:
        result = await session.execute(
            select(RefreshToken).where(RefreshToken.jti == old_jti)
        )
        old_token = result.scalar_one_or_none()

        if not old_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token",
            )

        if old_token.revoked_at is not None:
            # Possible token reuse detection — revoke entire family
            await session.execute(
                delete(RefreshToken).where(
                    RefreshToken.token_family == old_token.token_family
                )
            )
            await session.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token reused. Please log in again.",
            )

        if old_token.expires_at < datetime.now(timezone.utc):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token expired",
            )

        if old_token.user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token mismatch",
            )

        old_token.revoked_at = datetime.now(timezone.utc)
        await session.execute(
            text(f"SET LOCAL app.current_user_id = {user_id}"),
        )
        await session.commit()

        return await create_refresh_token(
            {"sub": str(user_id), "token_family": old_token.token_family}
        )


def decode_token(token: str, expected_type: str = "access") -> dict:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != expected_type:
            logger.error("Token type mismatch: got %r, expected %r", payload.get("type"), expected_type)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type",
            )
        return payload
    except JWTError as e:
        logger.error("JWT decode failed: %s | token prefix: %s", e, token[:20])
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


async def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> dict:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_token(credentials.credentials, expected_type="access")
    if "sub" in payload:
        payload["sub"] = int(payload["sub"])
    return payload
