import logging
from datetime import date, timedelta, datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.core.auth import get_current_user
from app.core.limiter import limiter
from app.models.budget import BudgetEntry

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
    amount: float
    category: str
    description: Optional[str] = None
    date_str: Optional[str] = None  # YYYY-MM-DD, defaults to today


@router.post("/")
@limiter.limit("30/minute")
async def add_expense(
    request: Request,
    body: BudgetCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I log a new budget entry."""
    entry_date = date.today()
    if body.date_str:
        entry_date = datetime.strptime(body.date_str, "%Y-%m-%d").date()

    entry = BudgetEntry(
        user_id=user["sub"],
        amount=round(body.amount, 2),
        category=body.category.lower(),
        description=body.description,
        date=entry_date,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return {
        "id": entry.id,
        "amount": entry.amount,
        "category": entry.category,
        "description": entry.description,
        "date": str(entry.date),
    }


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
    return {
        "entries": [{
            "id": e.id,
            "amount": e.amount,
            "category": e.category,
            "description": e.description,
            "date": str(e.date),
        } for e in entries],
        "total": round(sum(e.amount for e in entries), 2),
        "period": period,
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
