"""Claude connector links: a user creates, lists and revokes their own MCP keys.

Runs the real /user/mcp-keys routes on a temporary SQLite database with the
login faked. Needs aiosqlite (pip install aiosqlite).

Run with pytest, or standalone:  python3 tests/test_mcp_keys.py
"""
import asyncio
import hashlib
import os
import sys
import tempfile
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

from app.api.routes_user import MCP_MAX_LIVE_KEYS, router  # noqa: E402
from app.core.auth import get_current_user  # noqa: E402
from app.core.database import get_db  # noqa: E402
from app.core.limiter import limiter  # noqa: E402
from app.models.mcp_key import McpKey  # noqa: E402

# A file, not :memory:, so every connection sees the same tables; NullPool so no
# connection is reused across the test's and the TestClient's event loops.
DB_FILE = os.path.join(tempfile.mkdtemp(), "mcp_keys.db")
engine = create_async_engine(f"sqlite+aiosqlite:///{DB_FILE}", poolclass=NullPool)
Session = async_sessionmaker(engine, expire_on_commit=False)
current = {"sub": 1}


def make_client() -> TestClient:
    async def setup():
        async with engine.begin() as conn:
            await conn.run_sync(McpKey.__table__.create)
    asyncio.run(setup())

    async def db():
        async with Session() as s:
            yield s

    app = FastAPI()
    app.state.limiter = limiter
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_db] = db
    app.dependency_overrides[get_current_user] = lambda: current
    return TestClient(app)


def stored_hashes() -> list[str]:
    async def q():
        async with Session() as s:
            return [k.key_hash for k in (await s.execute(McpKey.__table__.select())).all()]
    return asyncio.run(q())


def test_links():
    c = make_client()

    r = c.post("/api/v1/user/mcp-keys", json={"label": "Laptop"})
    assert r.status_code == 200, r.text
    link = r.json()
    url = urlparse(link["url"])
    key = parse_qs(url.query)["key"][0]
    assert url.path == "/mcp/" and key.startswith("lo_") and len(key) > 40, link["url"]
    assert link["label"] == "Laptop"
    # Only a SHA-256 is stored, the same one mcp/server.py computes
    assert stored_hashes() == [hashlib.sha256(key.encode()).hexdigest()]

    listed = c.get("/api/v1/user/mcp-keys").json()["keys"]
    assert [k["id"] for k in listed] == [link["id"]] and "url" not in listed[0], listed
    assert c.post("/api/v1/user/mcp-keys", json={}).json()["label"] == "Claude"   # default name

    for _ in range(MCP_MAX_LIVE_KEYS - 2):
        assert c.post("/api/v1/user/mcp-keys", json={}).status_code == 200
    over = c.post("/api/v1/user/mcp-keys", json={})
    assert over.status_code == 400 and "Revoke one" in over.json()["detail"], over.text

    # Someone else can't revoke this user's link
    current["sub"] = 2
    assert c.delete(f"/api/v1/user/mcp-keys/{link['id']}").status_code == 404
    assert c.get("/api/v1/user/mcp-keys").json()["keys"] == []
    current["sub"] = 1

    assert c.delete(f"/api/v1/user/mcp-keys/{link['id']}").status_code == 200
    assert link["id"] not in [k["id"] for k in c.get("/api/v1/user/mcp-keys").json()["keys"]]
    assert c.delete(f"/api/v1/user/mcp-keys/{link['id']}").status_code == 404   # already revoked
    # Revoking freed a slot
    assert c.post("/api/v1/user/mcp-keys", json={}).status_code == 200


if __name__ == "__main__":
    test_links()
    print("  PASS test_links")
