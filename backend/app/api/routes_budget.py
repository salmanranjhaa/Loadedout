import logging
from datetime import date, timedelta, datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import or_, select
from pydantic import BaseModel, Field
from typing import Annotated, Literal, Optional
from app.core.database import get_db
from app.core.auth import get_current_user
from app.core.limiter import limiter
from app.models.budget import BudgetEntry, NON_SPENDING_CATEGORIES

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/budget", tags=["budget"])

CATEGORIES = ["food", "transport", "uni", "health", "entertainment", "shopping", "other"]

CATEGORY_COLORS = {
    "food": "#f59e0b",
    "transport": "#3b82f6",
    "uni": "#8b5cf6",
    "health": "#10b981",
    "entertainment": "#ec4899",
    "shopping": "#f97316",
    "other": "#64748b",
}


class BudgetCreate(BaseModel):
    amount: Annotated[float, Field(gt=0)]
    category: str
    description: Optional[str] = None
    date_str: Optional[str] = None  # YYYY-MM-DD, defaults to today
    # "card" = paid by credit card: counts as spending, but the cash is still in
    # the account until the card bill is paid
    payment_method: Literal["cash", "card"] = "cash"


class BudgetUpdate(BaseModel):
    amount: Optional[Annotated[float, Field(gt=0)]] = None
    category: Optional[str] = None
    description: Optional[str] = None
    date_str: Optional[str] = None
    payment_method: Optional[Literal["cash", "card"]] = None


def _parse_date(raw: Optional[str]) -> date:
    try:
        return datetime.strptime(raw, "%Y-%m-%d").date() if raw else date.today()
    except ValueError:
        raise HTTPException(status_code=400, detail="Date must look like 2026-10-09.")


def _entry_dict(e: BudgetEntry) -> dict:
    return {
        "id": e.id,
        "amount": e.amount,
        "category": e.category,
        "description": e.description,
        "date": str(e.date),
        "payment_method": e.payment_method or "cash",
    }


def card_outstanding(entries) -> float:
    """Credit-card spending not paid off yet, across all months: card
    purchases minus card payments ("card_payment" entries)."""
    owed = sum(e.amount for e in entries
               if e.payment_method == "card" and e.category not in NON_SPENDING_CATEGORIES)
    paid = sum(e.amount for e in entries if e.category == "card_payment")
    # ponytail: overpaying the card just reads as 0, not as a credit balance
    return round(max(owed - paid, 0.0), 2)


@router.post("/")
@limiter.limit("30/minute")
async def add_expense(
    request: Request,
    body: BudgetCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I log a new budget entry."""
    entry = BudgetEntry(
        user_id=user["sub"],
        amount=round(body.amount, 2),
        category=body.category.lower(),
        description=body.description,
        date=_parse_date(body.date_str),
        # Paying the card bill (and income) moves real cash; only purchases
        # can sit on the card.
        payment_method="cash" if body.category.lower() in NON_SPENDING_CATEGORIES else body.payment_method,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return _entry_dict(entry)


@router.get("/")
@limiter.limit("100/minute")
async def get_expenses(
    request: Request,
    period: str = "week",
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I return budget entries for a period (week, month, or N days)."""
    today = date.today()
    if period == "week":
        start = today - timedelta(days=today.weekday())
    elif period == "month":
        start = today.replace(day=1)
    else:
        start = today - timedelta(days=int(period) if period.isdigit() else 30)

    result = await db.execute(
        select(BudgetEntry)
        .where(BudgetEntry.user_id == user["sub"], BudgetEntry.date >= start)
        .order_by(BudgetEntry.date.desc())
    )
    entries = result.scalars().all()
    # The card bill isn't limited to this period: last month's purchases are
    # usually paid this month, so look at every card entry.
    card_result = await db.execute(
        select(BudgetEntry).where(
            BudgetEntry.user_id == user["sub"],
            or_(BudgetEntry.payment_method == "card", BudgetEntry.category == "card_payment"),
        )
    )
    return {
        "entries": [_entry_dict(e) for e in entries],
        "total": round(sum(e.amount for e in entries), 2),
        "period": period,
        "card_to_pay": card_outstanding(card_result.scalars().all()),
    }


@router.get("/summary")
@limiter.limit("100/minute")
async def get_budget_summary(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I return aggregated budget stats: this week, last week, this month, by category."""
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    prev_week_start = week_start - timedelta(days=7)
    month_start = today.replace(day=1)

    week_result = await db.execute(
        select(BudgetEntry).where(BudgetEntry.user_id == user["sub"], BudgetEntry.date >= week_start)
    )
    week_entries = week_result.scalars().all()

    prev_result = await db.execute(
        select(BudgetEntry).where(
            BudgetEntry.user_id == user["sub"],
            BudgetEntry.date >= prev_week_start,
            BudgetEntry.date < week_start,
        )
    )
    prev_entries = prev_result.scalars().all()

    month_result = await db.execute(
        select(BudgetEntry).where(BudgetEntry.user_id == user["sub"], BudgetEntry.date >= month_start)
    )
    month_entries = month_result.scalars().all()

    # By category this week
    by_category = {}
    for e in week_entries:
        by_category[e.category] = round(by_category.get(e.category, 0) + e.amount, 2)

    # Daily totals this week (keyed by date string)
    daily = {}
    for e in week_entries:
        d = str(e.date)
        daily[d] = round(daily.get(d, 0) + e.amount, 2)

    return {
        "this_week": {
            "total": round(sum(e.amount for e in week_entries), 2),
            "by_category": by_category,
            "daily": daily,
        },
        "last_week": {"total": round(sum(e.amount for e in prev_entries), 2)},
        "this_month": {"total": round(sum(e.amount for e in month_entries), 2)},
        "category_colors": CATEGORY_COLORS,
    }


@router.put("/{entry_id}")
@limiter.limit("30/minute")
async def update_expense(
    request: Request,
    entry_id: int,
    body: BudgetUpdate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I change an existing budget entry."""
    result = await db.execute(
        select(BudgetEntry).where(BudgetEntry.id == entry_id, BudgetEntry.user_id == user["sub"])
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    if body.amount is not None: entry.amount = round(body.amount, 2)
    if body.category is not None: entry.category = body.category.lower()
    if "description" in body.model_fields_set: entry.description = body.description
    if body.date_str is not None: entry.date = _parse_date(body.date_str)
    if body.payment_method is not None: entry.payment_method = body.payment_method
    # Same rule as adding: only purchases can sit on the card
    if entry.category in NON_SPENDING_CATEGORIES:
        entry.payment_method = "cash"
    await db.commit()
    await db.refresh(entry)
    return _entry_dict(entry)


@router.delete("/{entry_id}")
@limiter.limit("30/minute")
async def delete_expense(
    request: Request,
    entry_id: int,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(BudgetEntry).where(BudgetEntry.id == entry_id, BudgetEntry.user_id == user["sub"])
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    await db.delete(entry)
    await db.commit()
    return {"deleted": entry_id}
