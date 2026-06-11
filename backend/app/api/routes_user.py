import base64
import binascii
from datetime import datetime, timezone

from bson import Binary, ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Any, Dict, List, Optional
from app.core.database import get_db
from app.core.auth import get_current_user
from app.core.limiter import limiter
from app.core.mongo import get_mongo_db
from app.models.user import User

router = APIRouter(prefix="/user", tags=["user"])

ALLOWED_ACTIVITY = {"sedentary", "light", "moderate", "very_active", "athlete"}
ALLOWED_GOALS = {"lose_fat", "maintain", "build_muscle", "recomp", "performance"}
AVATAR_MAX_BYTES = 2 * 1024 * 1024  # frontend downscales; this is a hard cap
AVATAR_MIME = {"image/jpeg", "image/png", "image/webp"}


class SupplementItem(BaseModel):
    name: str
    dose: str
    times: List[str]  # HH:MM strings
    unit: str


class UserProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    current_weight_kg: Optional[float] = None
    target_weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    activity_level: Optional[str] = None
    fitness_goal: Optional[str] = None
    goal_pace_kg_per_week: Optional[float] = None
    daily_calorie_target: Optional[int] = None
    daily_protein_target: Optional[int] = None
    daily_carb_target: Optional[int] = None
    daily_fat_target: Optional[int] = None
    preferred_currency: Optional[str] = None
    supplements: Optional[List[SupplementItem]] = None
    dietary_preferences: Optional[Dict[str, Any]] = None
    training_preferences: Optional[Dict[str, Any]] = None
    routine_preferences: Optional[Dict[str, Any]] = None


class AvatarUpload(BaseModel):
    image_base64: str
    mime_type: str = "image/jpeg"


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
        "full_name": u.full_name,
        "has_avatar": bool(u.avatar_id),
        "google_connected": bool(u.google_sub),
        "role": u.role or "user",
        "is_active": bool(u.is_active),
        "current_weight_kg": u.current_weight_kg,
        "target_weight_kg": u.target_weight_kg,
        "height_cm": u.height_cm,
        "age": u.age,
        "gender": u.gender,
        "activity_level": u.activity_level,
        "fitness_goal": u.fitness_goal,
        "goal_pace_kg_per_week": u.goal_pace_kg_per_week,
        "daily_calorie_target": u.daily_calorie_target,
        "daily_protein_target": u.daily_protein_target,
        "daily_carb_target": u.daily_carb_target,
        "daily_fat_target": u.daily_fat_target,
        "preferred_currency": u.preferred_currency or "CHF",
        "supplements": u.supplements,
        "dietary_preferences": u.dietary_preferences,
        "training_preferences": u.training_preferences,
        "routine_preferences": u.routine_preferences,
        "member_since": u.created_at.date().isoformat() if u.created_at else None,
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
    if "full_name" in fields_set: u.full_name = (body.full_name or "").strip()[:120] or None
    if "current_weight_kg" in fields_set: u.current_weight_kg = body.current_weight_kg
    if "target_weight_kg" in fields_set: u.target_weight_kg = body.target_weight_kg
    if "height_cm" in fields_set: u.height_cm = body.height_cm
    if "age" in fields_set: u.age = body.age
    if "gender" in fields_set: u.gender = _normalize_gender(body.gender)
    if "activity_level" in fields_set:
        if body.activity_level is not None and body.activity_level not in ALLOWED_ACTIVITY:
            raise HTTPException(status_code=400, detail="Invalid activity_level")
        u.activity_level = body.activity_level
    if "fitness_goal" in fields_set:
        if body.fitness_goal is not None and body.fitness_goal not in ALLOWED_GOALS:
            raise HTTPException(status_code=400, detail="Invalid fitness_goal")
        u.fitness_goal = body.fitness_goal
    if "goal_pace_kg_per_week" in fields_set: u.goal_pace_kg_per_week = body.goal_pace_kg_per_week
    if "daily_calorie_target" in fields_set: u.daily_calorie_target = body.daily_calorie_target
    if "daily_protein_target" in fields_set: u.daily_protein_target = body.daily_protein_target
    if "daily_carb_target" in fields_set: u.daily_carb_target = body.daily_carb_target
    if "daily_fat_target" in fields_set: u.daily_fat_target = body.daily_fat_target
    if "preferred_currency" in fields_set:
        u.preferred_currency = _normalize_currency(body.preferred_currency) or "CHF"
    if "supplements" in fields_set and body.supplements is not None:
        u.supplements = [s.model_dump() for s in body.supplements]
    if "dietary_preferences" in fields_set and body.dietary_preferences is not None:
        u.dietary_preferences = {**(u.dietary_preferences or {}), **body.dietary_preferences}
    if "training_preferences" in fields_set and body.training_preferences is not None:
        u.training_preferences = {**(u.training_preferences or {}), **body.training_preferences}
    if "routine_preferences" in fields_set and body.routine_preferences is not None:
        u.routine_preferences = {**(u.routine_preferences or {}), **body.routine_preferences}
    await db.commit()
    await db.refresh(u)
    return {"updated": True, "username": u.username}


@router.post("/avatar")
@limiter.limit("10/minute")
async def upload_avatar(
    request: Request,
    body: AvatarUpload,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I store the user's profile picture (downscaled client-side) in MongoDB."""
    if body.mime_type not in AVATAR_MIME:
        raise HTTPException(status_code=400, detail="Unsupported image type")
    try:
        raw = base64.b64decode(body.image_base64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="Invalid base64 image data")
    if not raw or len(raw) > AVATAR_MAX_BYTES:
        raise HTTPException(status_code=400, detail="Image must be under 2MB")

    result = await db.execute(select(User).where(User.id == user["sub"]))
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    mongo = get_mongo_db()
    doc = {
        "user_id": u.id,
        "content_type": body.mime_type,
        "data": Binary(raw),
        "updated_at": datetime.now(timezone.utc),
    }
    old_id = u.avatar_id
    inserted = await mongo.avatars.insert_one(doc)
    u.avatar_id = str(inserted.inserted_id)
    await db.commit()
    if old_id:
        try:
            await mongo.avatars.delete_one({"_id": ObjectId(old_id)})
        except Exception:
            pass
    return {"updated": True, "has_avatar": True}


@router.get("/avatar")
@limiter.limit("100/minute")
async def get_avatar(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I return the user's profile picture as base64 (small, client-downscaled)."""
    result = await db.execute(select(User).where(User.id == user["sub"]))
    u = result.scalar_one_or_none()
    if not u or not u.avatar_id:
        raise HTTPException(status_code=404, detail="No avatar set")
    mongo = get_mongo_db()
    try:
        doc = await mongo.avatars.find_one({"_id": ObjectId(u.avatar_id)})
    except Exception:
        doc = None
    if not doc:
        raise HTTPException(status_code=404, detail="No avatar set")
    return {
        "image_base64": base64.b64encode(bytes(doc["data"])).decode(),
        "mime_type": doc.get("content_type", "image/jpeg"),
    }


@router.delete("/avatar")
@limiter.limit("10/minute")
async def delete_avatar(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I remove the user's profile picture."""
    result = await db.execute(select(User).where(User.id == user["sub"]))
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    if u.avatar_id:
        mongo = get_mongo_db()
        try:
            await mongo.avatars.delete_one({"_id": ObjectId(u.avatar_id)})
        except Exception:
            pass
        u.avatar_id = None
        await db.commit()
    return {"updated": True, "has_avatar": False}


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
