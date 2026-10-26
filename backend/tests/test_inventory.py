"""Pantry items: status (ok / running low / need to buy), storage and notes,
editing every field, and clearing the optional ones.

Runs the real /inventory routes on a temporary SQLite database with the login
faked. Needs aiosqlite (pip install aiosqlite).

Run with pytest, or standalone:  python3 tests/test_inventory.py
"""
import asyncio
import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

from app.api.routes_inventory import router  # noqa: E402
from app.core.auth import get_current_user  # noqa: E402
from app.core.database import get_db  # noqa: E402
from app.core.limiter import limiter  # noqa: E402
from app.models.inventory import InventoryItem  # noqa: E402

DB_FILE = os.path.join(tempfile.mkdtemp(), "inventory.db")
engine = create_async_engine(f"sqlite+aiosqlite:///{DB_FILE}", poolclass=NullPool)
Session = async_sessionmaker(engine, expire_on_commit=False)


def make_client() -> TestClient:
    async def setup():
        async with engine.begin() as conn:
            await conn.run_sync(InventoryItem.__table__.create)
    asyncio.run(setup())

    async def db():
        async with Session() as s:
            yield s

    app = FastAPI()
    app.state.limiter = limiter
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_db] = db
    app.dependency_overrides[get_current_user] = lambda: {"sub": 1}
    return TestClient(app)


def test_status_storage_notes_and_edits():
    c = make_client()
    url = "/api/v1/inventory/"

    plain = c.post(url, json={"name": "Rice", "quantity": 1000, "unit": "g", "category": "grains"}).json()
    assert plain["status"] == "ok" and plain["storage"] is None and plain["notes"] is None, plain

    peanuts = c.post(url, json={"name": "Peanuts", "quantity": 60, "unit": "g", "category": "pantry",
                                "status": "need_to_buy", "storage": "pantry", "notes": "  salted  "}).json()
    assert (peanuts["status"], peanuts["storage"], peanuts["notes"]) == ("need_to_buy", "pantry", "salted"), peanuts

    # Typing an exact amount, and 0 for something that ran out
    item = c.put(f"{url}{peanuts['id']}", json={"quantity": 100}).json()
    assert item["quantity"] == 100 and item["status"] == "need_to_buy" and item["notes"] == "salted", item
    assert c.put(f"{url}{peanuts['id']}", json={"quantity": 0}).json()["quantity"] == 0

    # Editing the whole entry
    item = c.put(f"{url}{peanuts['id']}", json={
        "name": "Peanuts (roasted)", "unit": "kg", "category": "protein", "status": "ok",
        "storage": "fridge", "notes": "Lidl", "expiry_date": "2026-12-01",
    }).json()
    assert (item["name"], item["unit"], item["category"], item["status"], item["storage"], item["notes"], item["expiry_date"]) == \
        ("Peanuts (roasted)", "kg", "protein", "ok", "fridge", "Lidl", "2026-12-01"), item

    # Clearing the optional fields
    item = c.put(f"{url}{peanuts['id']}", json={"storage": None, "notes": "", "expiry_date": None}).json()
    assert item["storage"] is None and item["notes"] is None and item["expiry_date"] is None, item
    assert item["name"] == "Peanuts (roasted)" and item["status"] == "ok"   # untouched

    # Values the app doesn't know are refused, not stored
    assert c.put(f"{url}{peanuts['id']}", json={"status": "gone"}).status_code == 422
    assert c.put(f"{url}{peanuts['id']}", json={"storage": "garage"}).status_code == 422
    assert c.put(f"{url}{peanuts['id']}", json={"quantity": -5}).status_code == 422
    assert c.put(f"{url}{peanuts['id']}", json={"name": ""}).status_code == 422

    listed = {i["name"]: i for i in c.get(url).json()["items"]}
    assert set(listed) == {"Rice", "Peanuts (roasted)"} and "status" in listed["Rice"], listed


if __name__ == "__main__":
    test_status_storage_notes_and_edits()
    print("  PASS test_status_storage_notes_and_edits")
