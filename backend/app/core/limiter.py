from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from jose import jwt
from app.core.config import get_settings

settings = get_settings()


def _rate_limit_key(request: Request) -> str:
    """I extract the user ID from the JWT for per-user rate limiting, falling back to IP."""
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        token = auth[7:]
        try:
            payload = jwt.decode(
                token,
                settings.SECRET_KEY,
                algorithms=["HS256"],
                options={"verify_exp": False},
            )
            user_id = payload.get("sub")
            if user_id:
                return f"user:{user_id}"
        except Exception:
            pass
    return get_remote_address(request)


limiter = Limiter(key_func=_rate_limit_key)
