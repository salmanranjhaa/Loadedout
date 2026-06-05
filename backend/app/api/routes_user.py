from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Any, List, Optional
from app.core.database import get_db
from app.core.auth import get_current_user
from app.core.limiter import limiter
from app.models.user import User

router = APIRouter(prefix="/user", tags=["user"])


class SupplementItem(BaseModel):
    name: str
    dose: str
    times: List[str]  # HH:MM strings
    unit: str


class UserProfileUpdate(BaseModel):
    current_weight_kg: Optional[float] = None
    target_weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    daily_calorie_target: Optional[int] = None
    daily_protein_target: Optional[int] = None
    daily_carb_target: Optional[int] = None
    daily_fat_target: Optional[int] = None
    preferred_currency: Optional[str] = None
    supplements: Optional[List[SupplementItem]] = None


def _normalize_currency(code: Optional[str]) -> Optional[str]:
    if code is None:
        return None
    normalized = code.strip().upper()
    if not normalized:
        return None
    if len(normalized) > 8:
        raise HTTPException(status_code=400, detail="Invalid currency code")
    return normalized


def _normalize_gender(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = value.strip().lower().replace(" ", "_")
    if not normalized:
        return None
    allowed = {"female", "male", "non_binary", "prefer_not_to_say", "other"}
    if normalized not in allowed:
        raise HTTPException(status_code=400, detail="Invalid gender value")
    return normalized


@router.get("/profile")
@limiter.limit("100/minute")
async def get_profile(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I return the current user's profile including targets and supplement schedule."""
    result = await db.execute(select(User).where(User.id == user["sub"]))
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": u.id,
        "username": u.username,
        "email": u.email,
        "google_connected": bool(u.google_sub),
        "role": u.role or "user",
        "is_active": bool(u.is_active),
        "current_weight_kg": u.current_weight_kg,
        "target_weight_kg": u.target_weight_kg,
        "height_cm": u.height_cm,
        "age": u.age,
        "gender": u.gender,
        "daily_calorie_target": u.daily_calorie_target,
        "daily_protein_target": u.daily_protein_target,
        "daily_carb_target": u.daily_carb_target,
        "daily_fat_target": u.daily_fat_target,
        "preferred_currency": u.preferred_currency or "CHF",
        "supplements": u.supplements,
        "dietary_preferences": u.dietary_preferences,
    }


@router.put("/profile")
@limiter.limit("30/minute")
async def update_profile(
    request: Request,
    body: UserProfileUpdate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I update physical stats and daily targets for the current user."""
    result = await db.execute(select(User).where(User.id == user["sub"]))
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    fields_set = getattr(body, "model_fields_set", getattr(body, "__fields_set__", set()))
    if "current_weight_kg" in fields_set: u.current_weight_kg = body.current_weight_kg
    if "target_weight_kg" in fields_set: u.target_weight_kg = body.target_weight_kg
    if "height_cm" in fields_set: u.height_cm = body.height_cm
    if "age" in fields_set: u.age = body.age
    if "gender" in fields_set: u.gender = _normalize_gender(body.gender)
    if "daily_calorie_target" in fields_set: u.daily_calorie_target = body.daily_calorie_target
    if "daily_protein_target" in fields_set: u.daily_protein_target = body.daily_protein_target
    if "daily_carb_target" in fields_set: u.daily_carb_target = body.daily_carb_target
    if "daily_fat_target" in fields_set: u.daily_fat_target = body.daily_fat_target
    if "preferred_currency" in fields_set:
        u.preferred_currency = _normalize_currency(body.preferred_currency) or "CHF"
    if "supplements" in fields_set and body.supplements is not None:
        u.supplements = [s.model_dump() for s in body.supplements]
    await db.commit()
    await db.refresh(u)
    return {"updated": True, "username": u.username}


@router.get("/supplements")
@limiter.limit("100/minute")
async def get_supplements(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I return the current user's supplement list."""
    result = await db.execute(select(User).where(User.id == user["sub"]))
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    return {"supplements": u.supplements or []}


@router.put("/supplements")
@limiter.limit("30/minute")
async def update_supplements(
    request: Request,
    body: List[SupplementItem],
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I replace the user's supplement list with a new structured list.
    Each supplement: {name, dose, times: [HH:MM], unit}."""
    result = await db.execute(select(User).where(User.id == user["sub"]))
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    u.supplements = [s.model_dump() for s in body]
    await db.commit()
    return {"updated": True, "count": len(body)}
