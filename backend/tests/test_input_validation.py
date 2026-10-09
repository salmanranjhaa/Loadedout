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


def test_card_to_pay_counts_card_purchases_minus_payments():
    from types import SimpleNamespace as E
    from app.api.routes_budget import card_outstanding
    entries = [
        E(amount=20.0, category="food", payment_method="card"),
        E(amount=45.5, category="fun", payment_method="card"),
        E(amount=64.8, category="food", payment_method="cash"),        # cash: not on the card
        E(amount=1500.0, category="income", payment_method="card"),    # income never counts
        E(amount=30.0, category="card_payment", payment_method="cash"),
    ]
    assert card_outstanding(entries) == 35.5          # 65.5 on the card, 30 paid
    entries.append(E(amount=100.0, category="card_payment", payment_method="cash"))
    assert card_outstanding(entries) == 0.0           # overpaid reads as nothing owed


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
