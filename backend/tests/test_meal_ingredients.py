"""A logged meal's ingredients: returned with the meal, replaced by an edit,
cleared with an empty list.

Runs the real /meals routes on a temporary SQLite database with the login faked.
Needs aiosqlite (pip install aiosqlite).

Run with pytest, or standalone:  python3 tests/test_meal_ingredients.py
"""
import asyncio
import os
import sys
import tempfile
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

from app.api.routes_meals import router  # noqa: E402
from app.core.auth import get_current_user  # noqa: E402
from app.core.database import get_db  # noqa: E402
from app.core.limiter import limiter  # noqa: E402
from app.models.meal import MealLog, MealTemplate  # noqa: E402
from app.models.user import User  # noqa: E402

DB_FILE = os.path.join(tempfile.mkdtemp(), "meals.db")
engine = create_async_engine(f"sqlite+aiosqlite:///{DB_FILE}", poolclass=NullPool)
Session = async_sessionmaker(engine, expire_on_commit=False)
OATS = [{"name": "Oats", "amount_g": 32, "calories": 119, "protein": 4.3},
        {"name": "Milk (low-fat 1.5%)", "amount_g": 110, "calories": 51, "protein": 3.7}]


def test_ingredients():
    async def setup():
        async with engine.begin() as conn:
            for t in (User.__table__, MealTemplate.__table__, MealLog.__table__):
                await conn.run_sync(t.create)
        async with Session() as s:
            s.add(User(id=1, username="me", email="me@example.com", hashed_password="x"))
            s.add(MealLog(id=1, user_id=1, date=date(2026, 10, 27), meal_type="lunch",
                          name="Overnight Oats", calories=540, protein_g=36, custom_ingredients=OATS))
            await s.commit()
    asyncio.run(setup())

    async def db():
        async with Session() as s:
            yield s

    app = FastAPI()
    app.state.limiter = limiter
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_db] = db
    app.dependency_overrides[get_current_user] = lambda: {"sub": 1}
    c = TestClient(app)

    meal = c.get("/api/v1/meals/today?date=2026-10-27").json()["meals"][0]
    assert meal["custom_ingredients"] == OATS, meal

    # An edit that doesn't mention ingredients leaves them alone
    assert c.put("/api/v1/meals/log/1", json={"calories": 550}).json()["custom_ingredients"] == OATS

    honey = OATS + [{"name": "Honey", "amount_g": 12.5, "calories": 38}]
    r = c.put("/api/v1/meals/log/1", json={"custom_ingredients": honey})
    assert r.status_code == 200 and r.json()["custom_ingredients"] == honey, r.text

    assert c.put("/api/v1/meals/log/1", json={"custom_ingredients": []}).json()["custom_ingredients"] == []


if __name__ == "__main__":
    test_ingredients()
    print("ok")
