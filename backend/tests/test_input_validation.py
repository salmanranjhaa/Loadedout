"""Rules that keep impossible values out: negative calories and events that
end before they start (both were accepted silently before).

Run with pytest, or standalone:  python3 tests/test_input_validation.py
"""
import os
import sys
from datetime import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import HTTPException  # noqa: E402
from pydantic import ValidationError  # noqa: E402

from app.api.routes_budget import BudgetCreate  # noqa: E402
from app.api.routes_meals import MealLogCreate, MealLogUpdate  # noqa: E402
from app.api.routes_schedule import _require_end_after_start  # noqa: E402


def _rejected(fn) -> bool:
    try:
        fn()
    except (ValidationError, HTTPException):
        return True
    return False


def test_meal_edit_rejects_negative_calories():
    assert _rejected(lambda: MealLogUpdate(calories=-100))
    assert _rejected(lambda: MealLogUpdate(fat_g=-1))
    assert MealLogUpdate(calories=0).calories == 0
    assert MealLogUpdate(calories=300).calories == 300


def test_meal_log_rejects_negative_macros():
    ok = dict(meal_type="lunch", name="Chicken", calories=330, protein_g=62)
    assert MealLogCreate(**ok).calories == 330
    assert _rejected(lambda: MealLogCreate(**{**ok, "protein_g": -5}))


def test_budget_payment_method_is_cash_or_card():
    assert BudgetCreate(amount=10, category="food").payment_method == "cash"
    assert BudgetCreate(amount=10, category="food", payment_method="card").payment_method == "card"
    assert _rejected(lambda: BudgetCreate(amount=10, category="food", payment_method="crypto"))


def test_budget_amount_must_be_positive():
    assert _rejected(lambda: BudgetCreate(amount=0, category="food"))
    assert _rejected(lambda: BudgetCreate(amount=-5, category="food"))


def test_edits_follow_the_same_rules():
    from app.api.routes_budget import BudgetUpdate, _parse_date
    from app.api.routes_workout import WorkoutUpdate
    assert BudgetUpdate(description="Lidl").amount is None   # partial edits are fine
    assert _rejected(lambda: BudgetUpdate(amount=0))
    assert _rejected(lambda: BudgetUpdate(payment_method="crypto"))
    assert _rejected(lambda: _parse_date("9.10.2026"))
    assert str(_parse_date("2026-10-09")) == "2026-10-09"
    assert WorkoutUpdate(duration_minutes=45).duration_minutes == 45
    assert _rejected(lambda: WorkoutUpdate(duration_minutes=0))


def test_card_to_pay_counts_card_purchases_minus_payments():
    from datetime import date, timedelta
    from types import SimpleNamespace as E
    from app.api.routes_budget import account_balances, card_to_pay
    today, later = date.today(), date.today() + timedelta(days=5)
    accounts = [E(id=1, name="Bank", kind="bank", opening_balance=0.0),
                E(id=2, name="Card", kind="credit_card", opening_balance=0.0)]
    entries = [
        E(amount=20.0, category="food", account_id=2, to_account_id=None, date=today),
        E(amount=45.5, category="fun", account_id=2, to_account_id=None, date=today),
        E(amount=64.8, category="food", account_id=1, to_account_id=None, date=today),       # paid from the bank
        E(amount=1500.0, category="income", account_id=1, to_account_id=None, date=today),   # income never counts
        E(amount=30.0, category="card_payment", account_id=1, to_account_id=2, date=today),
        E(amount=100.0, category="card_payment", account_id=1, to_account_id=2, date=later),  # scheduled
    ]
    assert card_to_pay(account_balances(accounts, entries, today)) == 35.5    # 65.5 on the card, 30 paid
    assert card_to_pay(account_balances(accounts, entries, later)) == 0.0     # overpaid reads as nothing owed


def test_event_must_end_after_it_starts():
    assert _rejected(lambda: _require_end_after_start(time(18, 0), time(17, 0)))
    assert _rejected(lambda: _require_end_after_start(time(12, 0), time(12, 0)))
    _require_end_after_start(time(12, 30), time(13, 15))
    _require_end_after_start(time(9, 0), None)  # events without an end time stay valid


if __name__ == "__main__":
    failures = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"  PASS {name}")
            except AssertionError as e:
                failures += 1
                print(f"  FAIL {name}: {e}")
    sys.exit(1 if failures else 0)
