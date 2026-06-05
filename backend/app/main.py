import logging
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from app.core.config import get_settings
from app.core.limiter import limiter
from app.api.routes_schedule import router as schedule_router
from app.api.routes_meals import router as meals_router
from app.api.routes_analytics import router as analytics_router
from app.api.routes_workout import router as workout_router
from app.api.routes_budget import router as budget_router
from app.api.routes_ai import router as ai_router
from app.api.routes_auth import router as auth_router
from app.api.routes_inventory import router as inventory_router
from app.api.routes_user import router as user_router
from app.api.routes_chat import router as chat_router
from app.api.routes_admin import router as admin_router
from app.api.routes_sync import router as sync_router
from app.api.routes_exercises import router as exercises_router

logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # I validate critical config at startup so problems are obvious immediately
    if settings.is_secret_key_placeholder():
        logger.warning(
            "SECRET_KEY is still the placeholder value. "
            'Generate one with: python -c "import secrets; print(secrets.token_hex(32))"'
        )
    if not settings.GCP_PROJECT_ID:
        logger.warning("GCP_PROJECT_ID is not set — Vertex AI (chat) will not work.")
    if not settings.MONGODB_URI:
        logger.warning("MONGODB_URI is not set — chat history persistence will be disabled.")
    logger.info(f"Starting {settings.APP_NAME} — model: {settings.VERTEX_AI_MODEL}")
    yield


app = FastAPI(
    title=settings.APP_NAME,
    description="Personal weekly routine, nutrition, and fitness tracking with Vertex AI",
    version="1.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter


async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    """I return a structured 429 response with a Retry-After header."""
    request_id = getattr(request.state, "request_id", "unknown")
    retry_after = getattr(exc, "retry_after", 60)
    return JSONResponse(
        status_code=429,
        content={
            "error": "rate_limit_exceeded",
            "message": "Rate limit exceeded. Please try again later.",
            "request_id": request_id,
        },
        headers={"Retry-After": str(retry_after)},
    )


app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """I catch unhandled exceptions and return structured JSON with a request ID."""
    request_id = getattr(request.state, "request_id", "unknown")
    logger.exception("Unhandled exception [request_id=%s]: %s", request_id, exc)
    return JSONResponse(
        status_code=500,
        content={
            "error": "internal_server_error",
            "message": "An unexpected error occurred",
            "request_id": request_id,
        },
    )


@app.middleware("http")
async def add_request_id(request: Request, call_next):
    """I attach a unique request ID to every request for traceability."""
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/v1")
app.include_router(schedule_router, prefix="/api/v1")
app.include_router(meals_router, prefix="/api/v1")
app.include_router(analytics_router, prefix="/api/v1")
app.include_router(workout_router, prefix="/api/v1")
app.include_router(budget_router, prefix="/api/v1")
app.include_router(ai_router, prefix="/api/v1")
app.include_router(inventory_router, prefix="/api/v1")
app.include_router(user_router, prefix="/api/v1")
app.include_router(chat_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")
app.include_router(sync_router, prefix="/api/v1")
app.include_router(exercises_router, prefix="/api/v1")


@app.get("/")
async def root():
    return {"app": settings.APP_NAME, "status": "running"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
