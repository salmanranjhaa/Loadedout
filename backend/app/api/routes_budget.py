import logging
from datetime import date, timedelta, datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import case, func, or_, select, update
from pydantic import BaseModel, Field
from typing import Annotated, Literal, Optional
from app.core.database import get_db
from app.core.auth import get_current_user
from app.core.limiter import limiter
from app.models.budget import (
    BudgetAccount, BudgetEntry, DEFAULT_BUDGET_LIMITS, NON_SPENDING_CATEGORIES, TRANSFER_CATEGORIES, entry_effect,
)
from app.models.user import User

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

AccountName = Annotated[str, Field(min_length=1, max_length=60)]


class BudgetCreate(BaseModel):
    amount: Annotated[float, Field(gt=0)]
    category: str
    description: Optional[str] = None
    date_str: Optional[str] = None  # YYYY-MM-DD, defaults to today; a later day is a scheduled entry
    account_id: Optional[int] = None     # paid from, or paid into for income
    to_account_id: Optional[int] = None  # transfers and card payments: where the money goes
    # Older app versions send "cash" or "card" instead of an account
    payment_method: Literal["cash", "card"] = "cash"


class BudgetUpdate(BaseModel):
    amount: Optional[Annotated[float, Field(gt=0)]] = None
    category: Optional[str] = None
    description: Optional[str] = None
    date_str: Optional[str] = None
    account_id: Optional[int] = None
    to_account_id: Optional[int] = None
    payment_method: Optional[Literal["cash", "card"]] = None


class AccountCreate(BaseModel):
    name: AccountName
    kind: Literal["bank", "credit_card"] = "bank"
    opening_balance: float = 0


class AccountUpdate(BaseModel):
    name: Optional[AccountName] = None
    kind: Optional[Literal["bank", "credit_card"]] = None
    opening_balance: Optional[float] = None


class LimitsUpdate(BaseModel):
    # Monthly budget per category; 0 means no budget for that category
    limits: dict[Annotated[str, Field(min_length=1, max_length=50)], Annotated[float, Field(ge=0)]]


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
        "account_id": e.account_id,
        "to_account_id": e.to_account_id,
        "payment_method": e.payment_method or "cash",
    }


def account_balances(accounts, entries, today: date) -> list[dict]:
    """Each account's balance today and once scheduled (future-dated) entries have gone through."""
    rows = []
    for a in accounts:
        balance = projected = a.opening_balance or 0.0
        for e in entries:
            effect = entry_effect(e, a.id)
            projected += effect
            if e.date <= today:
                balance += effect
        rows.append({
            "id": a.id,
            "name": a.name,
            "kind": a.kind,
            "opening_balance": a.opening_balance,
            "balance": round(balance, 2),
            "projected": round(projected, 2),
        })
    return rows


def card_to_pay(rows: list[dict]) -> float:
    """What the credit cards owe today."""
    return round(sum(max(-r["balance"], 0.0) for r in rows if r["kind"] == "credit_card"), 2)


async def _all_accounts(db: AsyncSession, user_id: int) -> list[BudgetAccount]:
    result = await db.execute(select(BudgetAccount).where(BudgetAccount.user_id == user_id).order_by(BudgetAccount.id))
    return result.scalars().all()


async def _all_entries(db: AsyncSession, user_id: int) -> list[BudgetEntry]:
    result = await db.execute(select(BudgetEntry).where(BudgetEntry.user_id == user_id))
    return result.scalars().all()


async def _owned_account(db: AsyncSession, user_id: int, account_id: int) -> BudgetAccount:
    result = await db.execute(
        select(BudgetAccount).where(BudgetAccount.id == account_id, BudgetAccount.user_id == user_id)
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


async def _default_account(db: AsyncSession, user_id: int, kind: str) -> BudgetAccount:
    """The user's first account of a kind, made on first use: older app versions
    only say cash or card."""
    result = await db.execute(
        select(BudgetAccount)
        .where(BudgetAccount.user_id == user_id, BudgetAccount.kind == kind)
        .order_by(BudgetAccount.id).limit(1)
    )
    account = result.scalar_one_or_none()
    if not account:
        account = BudgetAccount(user_id=user_id, kind=kind, name="Credit card" if kind == "credit_card" else "Main account")
        db.add(account)
        await db.flush()
    return account


async def _place(db: AsyncSession, user_id: int, entry: BudgetEntry, payment_method: Optional[str]) -> None:
    """I settle which account(s) an entry uses once its other fields are set."""
    if entry.category in TRANSFER_CATEGORIES:
        source = (await _owned_account(db, user_id, entry.account_id) if entry.account_id
                  else await _default_account(db, user_id, "bank"))
        if entry.to_account_id:
            target = await _owned_account(db, user_id, entry.to_account_id)
        elif entry.category == "card_payment":  # older app versions: "Card bill"
            target = await _default_account(db, user_id, "credit_card")
        else:
            raise HTTPException(status_code=400, detail="Pick the account the money goes to.")
        if source.id == target.id:
            raise HTTPException(status_code=400, detail="Pick two different accounts for a transfer.")
        entry.account_id, entry.to_account_id = source.id, target.id
        entry.category = "card_payment" if target.kind == "credit_card" else "transfer"
        entry.payment_method = "cash"
        return
    account = (await _owned_account(db, user_id, entry.account_id) if entry.account_id
               else await _default_account(db, user_id, "credit_card" if payment_method == "card" else "bank"))
    entry.account_id, entry.to_account_id = account.id, None
    # Only purchases sit on the card; income paid into a card is a refund
    entry.payment_method = "card" if account.kind == "credit_card" and entry.category not in NON_SPENDING_CATEGORIES else "cash"


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
        account_id=body.account_id,
        to_account_id=body.to_account_id,
    )
    await _place(db, user["sub"], entry, body.payment_method)
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return _entry_dict(entry)


@router.get("/")
@limiter.limit("100/minute")
async def get_expenses(
    request: Request,
    period: str = "week",
    month: Optional[str] = None,
    account_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I return budget entries for a period (week, month, all, or N days) or one
    month (YYYY-MM), optionally for one account. Scheduled entries are included."""
    today = date.today()
    query = select(BudgetEntry).where(BudgetEntry.user_id == user["sub"])
    if month:
        try:
            start = datetime.strptime(month, "%Y-%m").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Month must look like 2026-10.")
        end = (start + timedelta(days=32)).replace(day=1)
        query = query.where(BudgetEntry.date >= start, BudgetEntry.date < end)
    elif period != "all":
        if period == "week":
            start = today - timedelta(days=today.weekday())
        elif period == "month":
            start = today.replace(day=1)
        else:
            start = today - timedelta(days=int(period) if period.isdigit() else 30)
        query = query.where(BudgetEntry.date >= start)
    if account_id is not None:
        query = query.where(or_(BudgetEntry.account_id == account_id, BudgetEntry.to_account_id == account_id))

    entries = (await db.execute(query.order_by(BudgetEntry.date.desc(), BudgetEntry.id.desc()))).scalars().all()
    # The card bill isn't limited to this period: last month's purchases are
    # usually paid this month, so it comes from the card balances.
    balances = account_balances(await _all_accounts(db, user["sub"]), await _all_entries(db, user["sub"]), today)
    return {
        "entries": [_entry_dict(e) for e in entries],
        "total": round(sum(e.amount for e in entries), 2),
        "period": month or period,
        "card_to_pay": card_to_pay(balances),
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


# ---- Accounts ----

@router.get("/accounts")
@limiter.limit("100/minute")
async def get_accounts(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I return each account's balance, plus the total across all of them."""
    rows = account_balances(await _all_accounts(db, user["sub"]), await _all_entries(db, user["sub"]), date.today())
    return {
        "accounts": rows,
        "net_worth": round(sum(r["balance"] for r in rows), 2),
        "net_worth_projected": round(sum(r["projected"] for r in rows), 2),
        "card_to_pay": card_to_pay(rows),
    }


async def _check_name_free(db: AsyncSession, user_id: int, name: str, account_id: Optional[int] = None) -> str:
    name = name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Give the account a name.")
    query = select(BudgetAccount.id).where(BudgetAccount.user_id == user_id, func.lower(BudgetAccount.name) == name.lower())
    if account_id is not None:
        query = query.where(BudgetAccount.id != account_id)
    if (await db.execute(query)).first():
        raise HTTPException(status_code=409, detail=f"You already have an account called {name}.")
    return name


@router.post("/accounts")
@limiter.limit("30/minute")
async def add_account(
    request: Request,
    body: AccountCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    account = BudgetAccount(
        user_id=user["sub"],
        name=await _check_name_free(db, user["sub"], body.name),
        kind=body.kind,
        opening_balance=round(body.opening_balance, 2),
    )
    db.add(account)
    await db.commit()
    await db.refresh(account)
    return account_balances([account], [], date.today())[0]


@router.put("/accounts/{account_id}")
@limiter.limit("30/minute")
async def update_account(
    request: Request,
    account_id: int,
    body: AccountUpdate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    account = await _owned_account(db, user["sub"], account_id)
    if body.name is not None:
        account.name = await _check_name_free(db, user["sub"], body.name, account_id)
    if body.opening_balance is not None:
        account.opening_balance = round(body.opening_balance, 2)
    if body.kind is not None and body.kind != account.kind:
        account.kind = body.kind
        # Purchases on it become (or stop being) card purchases, and paying
        # into it becomes (or stops being) a card payment
        is_card = body.kind == "credit_card"
        await db.execute(
            update(BudgetEntry).where(BudgetEntry.account_id == account_id).values(
                payment_method=case(
                    (BudgetEntry.category.in_(sorted(NON_SPENDING_CATEGORIES)), "cash"),
                    else_="card" if is_card else "cash",
                )
            )
        )
        await db.execute(
            update(BudgetEntry).where(BudgetEntry.to_account_id == account_id)
            .values(category="card_payment" if is_card else "transfer")
        )
    await db.commit()
    await db.refresh(account)
    return account_balances([account], await _all_entries(db, user["sub"]), date.today())[0]


@router.delete("/accounts/{account_id}")
@limiter.limit("30/minute")
async def delete_account(
    request: Request,
    account_id: int,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    account = await _owned_account(db, user["sub"], account_id)
    used = (await db.execute(
        select(func.count()).select_from(BudgetEntry)
        .where(or_(BudgetEntry.account_id == account_id, BudgetEntry.to_account_id == account_id))
    )).scalar_one()
    if used:
        raise HTTPException(status_code=409, detail=f"{account.name} has {used} entries. Move or delete them first.")
    await db.delete(account)
    await db.commit()
    return {"deleted": account_id}


# ---- Category budgets ----

async def _limits(db: AsyncSession, user_id: int) -> dict:
    stored = (await db.execute(select(User.budget_limits).where(User.id == user_id))).scalar_one_or_none()
    return {**DEFAULT_BUDGET_LIMITS, **(stored or {})}


@router.get("/limits")
@limiter.limit("100/minute")
async def get_limits(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Monthly budget per category (0 = no budget)."""
    return {"limits": await _limits(db, user["sub"])}


@router.put("/limits")
@limiter.limit("30/minute")
async def update_limits(
    request: Request,
    body: LimitsUpdate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I change the budgets that are sent; the others stay as they are."""
    result = await db.execute(select(User).where(User.id == user["sub"]))
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    changes = {k.strip().lower(): round(v, 2) for k, v in body.limits.items()}
    u.budget_limits = {**(u.budget_limits or {}), **changes}
    await db.commit()
    return {"limits": await _limits(db, user["sub"])}


# ---- One entry ----

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
    if body.account_id is not None: entry.account_id = body.account_id
    if body.to_account_id is not None: entry.to_account_id = body.to_account_id
    # Older app versions only say cash or card: keep the account unless that changed
    if body.account_id is None and body.payment_method is not None and entry.category not in TRANSFER_CATEGORIES:
        current = await _owned_account(db, user["sub"], entry.account_id) if entry.account_id else None
        if current is None or (current.kind == "credit_card") != (body.payment_method == "card"):
            entry.account_id = None
    await _place(db, user["sub"], entry, body.payment_method)
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
