from datetime import date, datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.auth import get_current_user, hash_password
from app.core.database import get_db
from app.core.limiter import limiter
from app.models.analytics import WorkoutLog
from app.models.budget import BudgetEntry
from app.models.meal import MealLog
from app.models.user import User

router = APIRouter(prefix="/admin", tags=["admin"])
VALID_ROLES = {"user", "admin"}


class AdminCreateUser(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    role: str = "user"
    is_active: bool = True


class AdminUpdateUser(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = Field(default=None, min_length=8, max_length=128)


def _serialize_user(u: User) -> dict:
    return {
        "id": u.id,
        "username": u.username,
        "email": u.email,
        "role": u.role or "user",
        "is_active": bool(u.is_active),
        "created_at": u.created_at.isoformat() if u.created_at else None,
        "updated_at": u.updated_at.isoformat() if u.updated_at else None,
    }


async def _require_admin(
    db: AsyncSession = Depends(get_db),
    auth_user: dict = Depends(get_current_user),
) -> User:
    result = await db.execute(select(User).where(User.id == auth_user["sub"]))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    if (user.role or "user") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
    return user


@router.get("/overview")
@limiter.limit("30/minute")
async def get_admin_overview(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(_require_admin),
):
    today = date.today()
    week_ago = today - timedelta(days=7)
    week_ago_dt = datetime.now(timezone.utc) - timedelta(days=7)
    month_ago = today - timedelta(days=30)

    total_users = (await db.execute(select(func.count(User.id)))).scalar() or 0
    active_users = (
        await db.execute(select(func.count(User.id)).where(User.is_active.is_(True)))
    ).scalar() or 0
    admin_users = (
        await db.execute(select(func.count(User.id)).where(User.role == "admin"))
    ).scalar() or 0
    new_users_7d = (
        await db.execute(select(func.count(User.id)).where(User.created_at >= week_ago_dt))
    ).scalar() or 0
    workouts_7d = (
        await db.execute(select(func.count(WorkoutLog.id)).where(WorkoutLog.date >= week_ago))
    ).scalar() or 0
    meals_today = (
        await db.execute(select(func.count(MealLog.id)).where(MealLog.date == today))
    ).scalar() or 0
    expenses_30d = (
        await db.execute(select(func.coalesce(func.sum(BudgetEntry.amount), 0.0)).where(BudgetEntry.date >= month_ago))
    ).scalar() or 0.0

    return {
        "total_users": int(total_users),
        "active_users": int(active_users),
        "admin_users": int(admin_users),
        "new_users_7d": int(new_users_7d),
        "workouts_7d": int(workouts_7d),
        "meals_today": int(meals_today),
        "expenses_30d": float(expenses_30d),
    }


@router.get("/users")
@limiter.limit("30/minute")
async def list_users(
    request: Request,
    q: Optional[str] = Query(default=None, max_length=120),
    limit: int = Query(default=200, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(_require_admin),
):
    stmt = select(User).order_by(User.created_at.desc()).limit(limit)
    if q and q.strip():
        term = f"%{q.strip()}%"
        stmt = stmt.where(or_(User.username.ilike(term), User.email.ilike(term)))

    result = await db.execute(stmt)
    users = result.scalars().all()
    return {"users": [_serialize_user(u) for u in users], "count": len(users)}


@router.post("/users")
@limiter.limit("10/minute")
async def create_user(
    request: Request,
    body: AdminCreateUser,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(_require_admin),
):
    role = (body.role or "user").strip().lower()
    if role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")

    existing = await db.execute(
        select(User).where(or_(User.username == body.username, User.email == body.email))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Username or email already exists")

    user = User(
        username=body.username.strip(),
        email=body.email.strip().lower(),
        hashed_password=hash_password(body.password),
        role=role,
        is_active=body.is_active,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return _serialize_user(user)


@router.patch("/users/{user_id}")
@limiter.limit("10/minute")
async def update_user(
    request: Request,
    user_id: int,
    body: AdminUpdateUser,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(_require_admin),
):
    if body.role is None and body.is_active is None and body.password is None:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if body.role is not None:
        new_role = body.role.strip().lower()
        if new_role not in VALID_ROLES:
            raise HTTPException(status_code=400, detail="Invalid role")
        if admin.id == user.id and new_role != "admin":
            raise HTTPException(status_code=400, detail="Cannot remove your own admin role")
        user.role = new_role

    if body.is_active is not None:
        if admin.id == user.id and body.is_active is False:
            raise HTTPException(status_code=400, detail="Cannot deactivate your own account")
        user.is_active = body.is_active

    if body.password:
        user.hashed_password = hash_password(body.password)

    await db.commit()
    await db.refresh(user)
    return _serialize_user(user)
