"""Budget accounts: balances per account and in total, transfers and card bill
payments (also scheduled for a later day), older app versions that only say
cash or card, and category budgets.

Runs the real /budget routes on a temporary SQLite database with the login
faked. Needs aiosqlite (pip install aiosqlite).

Run with pytest, or standalone:  python3 tests/test_budget_accounts.py
"""
import asyncio
import os
import sys
import tempfile
from datetime import date, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

from app.api.routes_budget import router  # noqa: E402
from app.core.auth import get_current_user  # noqa: E402
from app.core.database import get_db  # noqa: E402
from app.core.limiter import limiter  # noqa: E402
from app.models.budget import BudgetAccount, BudgetEntry  # noqa: E402
from app.models.user import User  # noqa: E402


def make_client() -> TestClient:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tempfile.mkdtemp()}/budget.db", poolclass=NullPool)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async def setup():
        async with engine.begin() as conn:
            for table in (User.__table__, BudgetAccount.__table__, BudgetEntry.__table__):
                await conn.run_sync(table.create)
        async with Session() as s:
            s.add_all([User(id=1, username="me", email="me@test.invalid", hashed_password="x"),
                       User(id=2, username="other", email="other@test.invalid", hashed_password="x")])
            await s.flush()
            s.add(BudgetAccount(id=99, user_id=2, name="Not mine"))
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
    return TestClient(app)


def test_accounts_transfers_and_scheduled_payments():
    c = make_client()
    url = "/api/v1/budget/"
    today, tomorrow = str(date.today()), str(date.today() + timedelta(days=1))

    # Older app versions: cash / card / "Card bill" make the accounts they need
    old_cash = c.post(url, json={"amount": 10, "category": "food"}).json()
    old_card = c.post(url, json={"amount": 20, "category": "food", "payment_method": "card"}).json()
    old_bill = c.post(url, json={"amount": 20, "category": "card_payment"}).json()
    names = {a["name"]: a for a in c.get(url + "accounts").json()["accounts"]}
    main, card = names["Main account"], names["Credit card"]
    assert (main["kind"], card["kind"]) == ("bank", "credit_card"), names
    assert old_card["account_id"] == card["id"] and old_card["payment_method"] == "card", old_card
    assert (old_bill["account_id"], old_bill["to_account_id"]) == (main["id"], card["id"]), old_bill
    assert (main["balance"], card["balance"]) == (-30, 0), names
    for e in (old_cash, old_card, old_bill):
        c.delete(f"{url}{e['id']}")
    for a in (main, card):
        assert c.delete(f"{url}accounts/{a['id']}").status_code == 200

    # Accounts with what they held to start with
    ubs = c.post(url + "accounts", json={"name": "UBS", "opening_balance": 1000}).json()
    rev = c.post(url + "accounts", json={"name": "Revolut", "opening_balance": 500}).json()
    visa = c.post(url + "accounts", json={"name": "UBS Card", "kind": "credit_card"}).json()
    assert c.post(url + "accounts", json={"name": " ubs "}).status_code == 409

    groceries = c.post(url, json={"amount": 100, "category": "food", "account_id": ubs["id"]}).json()
    c.post(url, json={"amount": 2000, "category": "income", "account_id": ubs["id"], "description": "Salary"})
    topup = c.post(url, json={"amount": 200, "category": "transfer", "account_id": ubs["id"], "to_account_id": rev["id"]}).json()
    bought = c.post(url, json={"amount": 80, "category": "food", "account_id": visa["id"]}).json()
    paid = c.post(url, json={"amount": 50, "category": "transfer", "account_id": ubs["id"], "to_account_id": visa["id"]}).json()
    later = c.post(url, json={"amount": 30, "category": "card_payment", "account_id": ubs["id"],
                              "to_account_id": visa["id"], "date_str": tomorrow}).json()
    assert topup["category"] == "transfer" and bought["payment_method"] == "card", (topup, bought)
    assert paid["category"] == "card_payment" and paid["payment_method"] == "cash", paid    # into a card = card bill
    assert later["date"] == tomorrow, later

    got = c.get(url + "accounts").json()
    bal = {a["name"]: (a["balance"], a["projected"]) for a in got["accounts"]}
    assert bal == {"UBS": (2650, 2620), "Revolut": (700, 700), "UBS Card": (-30, 0)}, bal
    assert (got["net_worth"], got["net_worth_projected"], got["card_to_pay"]) == (3320, 3320, 30), got

    # One account's entries include money paid into it
    card_ids = {e["id"] for e in c.get(url, params={"period": "all", "account_id": visa["id"]}).json()["entries"]}
    assert card_ids == {bought["id"], paid["id"], later["id"]}, card_ids
    month = c.get(url, params={"month": today[:7]}).json()
    assert {e["id"] for e in month["entries"]} >= {groceries["id"], topup["id"]} and month["card_to_pay"] == 30, month

    # Transfers need two different accounts of yours
    assert c.post(url, json={"amount": 5, "category": "transfer", "account_id": ubs["id"]}).status_code == 400
    assert c.post(url, json={"amount": 5, "category": "transfer", "account_id": ubs["id"], "to_account_id": ubs["id"]}).status_code == 400
    assert c.post(url, json={"amount": 5, "category": "food", "account_id": 99}).status_code == 404

    # Editing: move a purchase onto the card, then back as an older app would
    moved = c.put(f"{url}{groceries['id']}", json={"account_id": visa["id"]}).json()
    assert moved["payment_method"] == "card", moved
    kept = c.put(f"{url}{topup['id']}", json={"amount": 250, "payment_method": "cash"}).json()
    assert (kept["account_id"], kept["to_account_id"], kept["amount"]) == (ubs["id"], rev["id"], 250), kept
    rev_food = c.post(url, json={"amount": 7, "category": "food", "account_id": rev["id"]}).json()
    assert c.put(f"{url}{rev_food['id']}", json={"payment_method": "cash", "amount": 8}).json()["account_id"] == rev["id"]
    assert c.put(f"{url}{rev_food['id']}", json={"payment_method": "card"}).json()["account_id"] == visa["id"]

    # Accounts: rename, change kind, delete only when empty
    assert c.put(f"{url}accounts/{rev['id']}", json={"name": "UBS"}).status_code == 409
    assert c.put(f"{url}accounts/{rev['id']}", json={"name": "Revolut CHF", "opening_balance": 450}).json()["balance"] == 700
    flipped = c.put(f"{url}accounts/{visa['id']}", json={"kind": "bank"}).json()
    assert flipped["kind"] == "bank"
    on_visa = c.get(url, params={"period": "all", "account_id": visa["id"]}).json()["entries"]
    assert {e["payment_method"] for e in on_visa if e["account_id"] == visa["id"]} == {"cash"}, on_visa
    assert {e["category"] for e in on_visa if e["to_account_id"] == visa["id"]} == {"transfer"}, on_visa
    assert c.delete(f"{url}accounts/{rev['id']}").status_code == 409
    empty = c.post(url + "accounts", json={"name": "Old savings"}).json()
    assert c.delete(f"{url}accounts/{empty['id']}").status_code == 200
    assert c.delete(f"{url}accounts/99").status_code == 404


def test_category_budgets():
    c = make_client()
    url = "/api/v1/budget/limits"
    assert c.get(url).json()["limits"]["food"] == 400                     # default
    got = c.put(url, json={"limits": {"Food": 300, "fun": 0}}).json()["limits"]
    assert (got["food"], got["fun"], got["rent"]) == (300, 0, 1200), got  # others unchanged
    assert c.put(url, json={"limits": {"food": -1}}).status_code == 422
    assert c.get(url).json()["limits"]["food"] == 300


if __name__ == "__main__":
    test_accounts_transfers_and_scheduled_payments()
    print("  PASS test_accounts_transfers_and_scheduled_payments")
    test_category_budgets()
    print("  PASS test_category_budgets")
