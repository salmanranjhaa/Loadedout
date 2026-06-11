from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text
from fastapi import Request
from app.core.config import get_settings

settings = get_settings()

# I create the async engine for PostgreSQL
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_size=10,
    max_overflow=20,
    # Stale connections (DB restarts, idle timeouts) otherwise surface as 500s
    pool_pre_ping=True,
    pool_recycle=1800,
)

# I use async_sessionmaker for all database operations
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db(request: Request = None) -> AsyncSession:
    # I yield a session and ensure it closes after the request
    async with async_session() as session:
        # If an Authorization header is present, set RLS context so PostgreSQL
        # Row Level Security policies can enforce user isolation at the DB level.
        if request is not None:
            auth = request.headers.get("Authorization", "")
            if auth.lower().startswith("bearer "):
                token = auth[7:]
                try:
                    from jose import jwt
                    payload = jwt.decode(
                        token,
                        settings.SECRET_KEY,
                        algorithms=["HS256"],
                        options={"verify_exp": False},
                    )
                    user_id = payload.get("sub")
                    if user_id:
                        await session.execute(
                            text(f"SET LOCAL app.current_user_id = {int(user_id)}"),
                        )
                except Exception:
                    pass
        try:
            yield session
        finally:
            await session.close()
