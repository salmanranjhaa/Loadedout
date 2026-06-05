import re
import secrets
from urllib.parse import urlparse
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import HTMLResponse, JSONResponse
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field
from app.core.auth import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    hash_password,
    rotate_refresh_token,
    verify_password,
)
from app.core.config import get_settings
from app.core.database import get_db
from app.models.google_oauth import GoogleOAuthToken
from app.models.user import User
from app.services.google_oauth import (
    build_google_auth_url,
    build_popup_response_html,
    decode_google_state,
    encode_google_state,
    exchange_google_code,
    fetch_google_userinfo,
    scopes_to_string,
    token_expiry_from_google_response,
    verify_google_id_token,
)
from app.core.limiter import limiter

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()
GOOGLE_LOGIN_SCOPES = ["openid", "email", "profile"]
GOOGLE_CONNECT_SCOPES = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/calendar.readonly",
]


class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: int
    username: str
    role: str


class GoogleAuthUrlResponse(BaseModel):
    auth_url: str


class GoogleIdTokenRequest(BaseModel):
    id_token: str
    mode: str = Field(pattern="^(login|signup)$")


def _validate_origin(origin: str) -> str:
    parsed = urlparse(origin or "")
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status_code=400, detail="Invalid origin")
    return f"{parsed.scheme}://{parsed.netloc}"


def _validate_password_strength(password: str) -> None:
    has_letter = any(ch.isalpha() for ch in password)
    has_digit = any(ch.isdigit() for ch in password)
    if not (has_letter and has_digit):
        raise HTTPException(
            status_code=400,
            detail="Password must contain at least one letter and one number",
        )


def _validate_email_format(email: str) -> None:
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise HTTPException(status_code=400, detail="Invalid email address")


def _set_auth_cookies(response: JSONResponse, access_token: str, refresh_token: str) -> None:
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=settings.SECURE_COOKIES,
        samesite="lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        domain=settings.COOKIE_DOMAIN or None,
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=settings.SECURE_COOKIES,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        domain=settings.COOKIE_DOMAIN or None,
    )


async def _token_response(user: User, cookie_mode: bool = False) -> JSONResponse | TokenResponse:
    token_data = {"sub": str(user.id)}
    access_token = create_access_token(token_data)
    refresh_token = await create_refresh_token(token_data)
    data = {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user_id": user.id,
        "username": user.username,
        "role": user.role or "user",
    }
    if cookie_mode:
        response = JSONResponse(content=data)
        _set_auth_cookies(response, access_token, refresh_token)
        return response
    return TokenResponse(**data)


async def _username_exists(db: AsyncSession, candidate: str) -> bool:
    result = await db.execute(select(User.id).where(func.lower(User.username) == candidate.lower()))
    return result.scalar_one_or_none() is not None


async def _generate_unique_username(db: AsyncSession, email: str) -> str:
    base = re.sub(r"[^a-z0-9_]+", "_", email.split("@")[0].lower()).strip("_")
    if len(base) < 3:
        base = f"user_{base}" if base else "user"
    base = base[:40]

    candidate = base
    suffix = 1
    while await _username_exists(db, candidate):
        suffix += 1
        candidate = f"{base[:34]}_{suffix}"
    return candidate


async def _upsert_google_token(
    db: AsyncSession,
    *,
    user_id: int,
    google_sub: str,
    google_email: str | None,
    token_data: dict,
) -> None:
    conflict_result = await db.execute(
        select(GoogleOAuthToken).where(
            GoogleOAuthToken.google_sub == google_sub,
            GoogleOAuthToken.user_id != user_id,
        )
    )
    if conflict_result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Google account is already linked to another user")

    result = await db.execute(select(GoogleOAuthToken).where(GoogleOAuthToken.user_id == user_id))
    row = result.scalar_one_or_none()
    if not row:
        row = GoogleOAuthToken(
            user_id=user_id,
            google_sub=google_sub,
            google_email=google_email,
            access_token=token_data.get("access_token", ""),
            refresh_token=token_data.get("refresh_token"),
            token_expiry=token_expiry_from_google_response(token_data),
            scopes=scopes_to_string(token_data),
        )
        db.add(row)
        return

    row.google_sub = google_sub
    row.google_email = google_email
    if token_data.get("access_token"):
        row.access_token = token_data["access_token"]
    # Keep existing refresh token if Google doesn't return a new one this time.
    if token_data.get("refresh_token"):
        row.refresh_token = token_data["refresh_token"]
    expiry = token_expiry_from_google_response(token_data)
    if expiry is not None:
        row.token_expiry = expiry
    scopes = scopes_to_string(token_data)
    if scopes:
        row.scopes = scopes


@router.post("/login")
@limiter.limit("5/minute")
async def login(
    request: Request,
    body: LoginRequest,
    cookie_mode: bool = Query(False, description="Return tokens in httpOnly cookies"),
    db: AsyncSession = Depends(get_db),
):
    """I authenticate the user and return an access + refresh token pair."""
    identifier = body.username.strip()
    result = await db.execute(
        select(User).where(
            or_(
                func.lower(User.username) == identifier.lower(),
                func.lower(User.email) == identifier.lower(),
            )
        )
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    return await _token_response(user, cookie_mode=cookie_mode)


@router.post("/register")
@limiter.limit("5/minute")
async def register(
    request: Request,
    body: RegisterRequest,
    cookie_mode: bool = Query(False, description="Return tokens in httpOnly cookies"),
    db: AsyncSession = Depends(get_db),
):
    """I create a new local user account and immediately return JWT tokens."""
    username = body.username.strip()
    email = body.email.strip().lower()
    _validate_email_format(email)
    _validate_password_strength(body.password)

    existing = await db.execute(
        select(User).where(
            or_(
                func.lower(User.username) == username.lower(),
                func.lower(User.email) == email.lower(),
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Username or email already exists")

    user = User(
        username=username,
        email=email,
        hashed_password=hash_password(body.password),
        role="user",
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return await _token_response(user, cookie_mode=cookie_mode)


@router.post("/refresh")
@limiter.limit("10/minute")
async def refresh(
    request: Request,
    body: RefreshRequest,
    cookie_mode: bool = Query(False, description="Return tokens in httpOnly cookies"),
    db: AsyncSession = Depends(get_db),
):
    """I exchange a valid refresh token for a new access + refresh token pair, rotating the family."""
    payload = decode_token(body.refresh_token, expected_type="refresh")
    old_jti = payload.get("jti")
    user_id = int(payload["sub"])

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    if not old_jti:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Malformed refresh token")

    new_refresh_token = await rotate_refresh_token(old_jti, user_id)
    access_token = create_access_token({"sub": str(user.id)})

    data = {
        "access_token": access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer",
        "user_id": user.id,
        "username": user.username,
        "role": user.role or "user",
    }
    if cookie_mode:
        response = JSONResponse(content=data)
        _set_auth_cookies(response, access_token, new_refresh_token)
        return response
    return TokenResponse(**data)


@router.post("/google/id-token")
@limiter.limit("5/minute")
async def google_id_token_login(
    request: Request,
    body: GoogleIdTokenRequest,
    cookie_mode: bool = Query(False, description="Return tokens in httpOnly cookies"),
    db: AsyncSession = Depends(get_db),
):
    """Accept a Google ID token from native Sign-In, verify it, and return app JWT tokens.

    Used by the Android/iOS apps via @codetrix-studio/capacitor-google-auth.
    The web popup/redirect flow continues to use /google/login-url + /google/callback.
    """
    try:
        claims = await verify_google_id_token(body.id_token)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))

    google_sub = (claims.get("sub") or "").strip()
    google_email = (claims.get("email") or "").strip().lower()
    email_verified = bool(claims.get("email_verified"))

    if not google_sub or not google_email:
        raise HTTPException(status_code=400, detail="Google did not return required profile fields")
    if not email_verified:
        raise HTTPException(status_code=400, detail="Google email is not verified")

    if body.mode == "login":
        user_result = await db.execute(select(User).where(User.google_sub == google_sub))
        user = user_result.scalar_one_or_none()
        if not user:
            by_email = await db.execute(select(User).where(func.lower(User.email) == google_email.lower()))
            user = by_email.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=404, detail="No account found for this Google email. Please sign up first.")
        if not user.is_active:
            raise HTTPException(status_code=403, detail="Account is disabled")
        user.google_sub = google_sub
        await db.commit()
        await db.refresh(user)
        return await _token_response(user, cookie_mode=cookie_mode)

    # mode == "signup"
    existing = await db.execute(select(User).where(User.google_sub == google_sub))
    user = existing.scalar_one_or_none()
    if not user:
        by_email = await db.execute(select(User).where(func.lower(User.email) == google_email.lower()))
        user = by_email.scalar_one_or_none()
    if user:
        raise HTTPException(status_code=409, detail="Account already exists. Please sign in instead.")

    generated_username = await _generate_unique_username(db, google_email)
    user = User(
        username=generated_username,
        email=google_email,
        hashed_password=hash_password(secrets.token_urlsafe(32)),
        role="user",
        is_active=True,
        google_sub=google_sub,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return await _token_response(user, cookie_mode=cookie_mode)


@router.get("/google/login-url", response_model=GoogleAuthUrlResponse)
@limiter.limit("10/minute")
async def google_login_url(
    request: Request,
    origin: str = Query(..., description="Frontend origin, e.g. https://app.example.com"),
    native: bool = Query(False, description="Use native-app callback behavior"),
    mode: str = Query("login", pattern="^(login|signup)$", description="Google auth mode: login or signup"),
):
    """I build a Google OAuth URL for sign-in with popup state binding to the frontend origin."""
    safe_origin = _validate_origin(origin)
    state_token = encode_google_state(mode=mode, origin=safe_origin, native=native)
    auth_url = build_google_auth_url(state_token=state_token, scopes=GOOGLE_LOGIN_SCOPES)
    return GoogleAuthUrlResponse(auth_url=auth_url)


@router.get("/google/connect-url", response_model=GoogleAuthUrlResponse)
@limiter.limit("10/minute")
async def google_connect_url(
    request: Request,
    origin: str = Query(..., description="Frontend origin, e.g. https://app.example.com"),
    native: bool = Query(False, description="Use native-app callback behavior"),
    auth_user: dict = Depends(get_current_user),
):
    """I build a Google OAuth URL for linking calendar access to an already-authenticated user."""
    safe_origin = _validate_origin(origin)
    state_token = encode_google_state(
        mode="connect",
        origin=safe_origin,
        user_id=auth_user["sub"],
        native=native,
    )
    auth_url = build_google_auth_url(state_token=state_token, scopes=GOOGLE_CONNECT_SCOPES)
    return GoogleAuthUrlResponse(auth_url=auth_url)


@router.get("/google/callback", response_class=HTMLResponse)
@limiter.limit("20/minute")
async def google_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """I handle Google OAuth callback and send result back to the opener window via postMessage."""
    origin = None
    mode = "unknown"
    native_redirect_uri = None
    try:
        if not state:
            raise RuntimeError("Missing OAuth state")
        decoded_state = decode_google_state(state)
        origin = _validate_origin(decoded_state.get("origin", ""))
        mode = decoded_state.get("mode", "unknown")
        native = bool(decoded_state.get("native"))
        native_redirect_uri = settings.GOOGLE_NATIVE_REDIRECT_URI if native else None

        if error:
            raise RuntimeError(error)
        if not code:
            raise RuntimeError("Missing authorization code")

        token_data = await exchange_google_code(code)
        access_token = token_data.get("access_token")
        if not access_token:
            raise RuntimeError("No access token returned by Google")
        userinfo = await fetch_google_userinfo(access_token)
        google_sub = (userinfo.get("sub") or "").strip()
        google_email = (userinfo.get("email") or "").strip().lower()
        email_verified = bool(userinfo.get("email_verified"))

        if not google_sub or not google_email:
            raise RuntimeError("Google did not return required profile fields")
        if not email_verified:
            raise RuntimeError("Google email is not verified")

        if mode == "login":
            user_result = await db.execute(select(User).where(User.google_sub == google_sub))
            user = user_result.scalar_one_or_none()
            if not user:
                by_email = await db.execute(select(User).where(func.lower(User.email) == google_email.lower()))
                user = by_email.scalar_one_or_none()

            if not user:
                raise RuntimeError("No account found for this Google email. Please sign up first.")

            if not user.is_active:
                raise RuntimeError("Account is disabled")

            user.google_sub = google_sub
            await _upsert_google_token(
                db,
                user_id=user.id,
                google_sub=google_sub,
                google_email=google_email,
                token_data=token_data,
            )
            await db.commit()
            await db.refresh(user)

            app_tokens = await _token_response(user)
            payload = {
                "status": "success",
                "mode": "login",
                "access_token": app_tokens.access_token,
                "refresh_token": app_tokens.refresh_token,
                "user_id": app_tokens.user_id,
                "username": app_tokens.username,
                "role": app_tokens.role,
            }
            return HTMLResponse(build_popup_response_html(payload, origin, native_redirect_uri))

        if mode == "signup":
            existing_by_google = await db.execute(select(User).where(User.google_sub == google_sub))
            user = existing_by_google.scalar_one_or_none()
            if not user:
                by_email = await db.execute(select(User).where(func.lower(User.email) == google_email.lower()))
                user = by_email.scalar_one_or_none()

            if user:
                raise RuntimeError("Account already exists. Please sign in instead.")

            generated_username = await _generate_unique_username(db, google_email)
            user = User(
                username=generated_username,
                email=google_email,
                hashed_password=hash_password(secrets.token_urlsafe(32)),
                role="user",
                is_active=True,
                google_sub=google_sub,
            )
            db.add(user)
            await db.flush()

            await _upsert_google_token(
                db,
                user_id=user.id,
                google_sub=google_sub,
                google_email=google_email,
                token_data=token_data,
            )
            await db.commit()
            await db.refresh(user)

            app_tokens = await _token_response(user)
            payload = {
                "status": "success",
                "mode": "signup",
                "access_token": app_tokens.access_token,
                "refresh_token": app_tokens.refresh_token,
                "user_id": app_tokens.user_id,
                "username": app_tokens.username,
                "role": app_tokens.role,
            }
            return HTMLResponse(build_popup_response_html(payload, origin, native_redirect_uri))

        if mode == "connect":
            linked_user_id = decoded_state.get("user_id")
            if not linked_user_id:
                raise RuntimeError("Missing user binding for connect flow")

            user_result = await db.execute(select(User).where(User.id == int(linked_user_id)))
            user = user_result.scalar_one_or_none()
            if not user or not user.is_active:
                raise RuntimeError("User not found or inactive")

            user.google_sub = google_sub
            await _upsert_google_token(
                db,
                user_id=user.id,
                google_sub=google_sub,
                google_email=google_email,
                token_data=token_data,
            )
            await db.commit()

            payload = {
                "status": "success",
                "mode": "connect",
                "google_email": google_email,
            }
            return HTMLResponse(build_popup_response_html(payload, origin, native_redirect_uri))

        raise RuntimeError("Unknown OAuth mode")
    except Exception as e:
        payload = {
            "status": "error",
            "mode": mode,
            "error": str(e),
        }
        return HTMLResponse(build_popup_response_html(payload, origin, native_redirect_uri))
