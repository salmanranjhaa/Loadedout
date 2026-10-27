"""Google connect: linking a Google account that another user already holds.

Runs the real /auth/google/callback on a temporary SQLite database with Google
stubbed out. Needs aiosqlite (pip install aiosqlite).

Run with pytest, or standalone:  python3 tests/test_google_connect.py
"""
import asyncio
import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

import app.api.routes_auth as auth  # noqa: E402
from app.core.database import get_db  # noqa: E402
from app.core.limiter import limiter  # noqa: E402
from app.models.google_oauth import GoogleOAuthToken  # noqa: E402
from app.models.user import User  # noqa: E402

DB_FILE = os.path.join(tempfile.mkdtemp(), "google_connect.db")
engine = create_async_engine(f"sqlite+aiosqlite:///{DB_FILE}", poolclass=NullPool)
Session = async_sessionmaker(engine, expire_on_commit=False)


def make_client() -> TestClient:
    async def setup():
        async with engine.begin() as conn:
            await conn.run_sync(User.__table__.create)
            await conn.run_sync(GoogleOAuthToken.__table__.create)
        async with Session() as s:
            s.add_all([
                User(id=1, username="me", email="me@example.com", hashed_password="x"),
                User(id=2, username="other", email="other@gmail.com", hashed_password="x", google_sub="taken-sub"),
            ])
            await s.commit()
    asyncio.run(setup())

    async def db():
        async with Session() as s:
            yield s

    app = FastAPI()
    app.state.limiter = limiter
    app.include_router(auth.router, prefix="/api/v1")
    app.dependency_overrides[get_db] = db
    return TestClient(app)


def stub_google(sub: str, email: str):
    """User 1 is connecting; Google answers with this account."""
    async def exchange(code):
        return {"access_token": "at", "refresh_token": "rt", "expires_in": 3600, "scope": "openid email"}

    async def userinfo(token):
        return {"sub": sub, "email": email, "email_verified": True}

    auth.decode_google_state = lambda state: {"mode": "connect", "origin": "https://loadedout.online", "user_id": 1}
    auth.exchange_google_code = exchange
    auth.fetch_google_userinfo = userinfo


def google_sub_of(user_id: int):
    async def q():
        async with Session() as s:
            return (await s.execute(select(User.google_sub).where(User.id == user_id))).scalar_one()
    return asyncio.run(q())


def test_connect():
    c = make_client()

    # Another user already has this Google account: a clear message, not SQL
    stub_google("taken-sub", "other@gmail.com")
    r = c.get("/api/v1/auth/google/callback?code=c&state=s")
    assert r.status_code == 200, r.text
    assert "other@gmail.com is already linked to another Loaded Out account" in r.text, r.text
    assert "IntegrityError" not in r.text and "UPDATE users" not in r.text, r.text
    assert google_sub_of(1) is None and google_sub_of(2) == "taken-sub"

    # A Google account nobody holds links fine
    stub_google("free-sub", "me@gmail.com")
    r = c.get("/api/v1/auth/google/callback?code=c&state=s")
    assert '"status": "success"' in r.text, r.text
    assert google_sub_of(1) == "free-sub"


if __name__ == "__main__":
    test_connect()
    print("ok")
