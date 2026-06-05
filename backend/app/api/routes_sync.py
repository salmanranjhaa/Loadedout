from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.core.database import get_db
from app.core.auth import get_current_user
from app.core.limiter import limiter
from app.models.analytics import WeightLog, WorkoutLog
from app.models.meal import MealLog
from app.models.fitness import WaterLog

router = APIRouter(prefix="/sync", tags=["sync"])


class SyncResponse(BaseModel):
    workouts: list[dict]
    meals: list[dict]
    weight_logs: list[dict]
    water_logs: list[dict]
    synced_at: str


@router.get("/")
@limiter.limit("60/minute")
async def sync_changes(
    request: Request,
    since: datetime = Query(..., description="ISO timestamp of last sync"),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I return all changes since the provided timestamp for cross-device sync."""
    user_id = user["sub"]
    since_dt = since.replace(tzinfo=timezone.utc) if since.tzinfo is None else since

    # Workouts
    workout_result = await db.execute(
        select(WorkoutLog)
        .where(
            WorkoutLog.user_id == user_id,
            WorkoutLog.created_at >= since_dt,
        )
        .order_by(WorkoutLog.created_at.desc())
    )
    workouts = [
        {
            "id": w.id,
            "date": str(w.date),
            "workout_type": w.workout_type,
            "duration_minutes": w.duration_minutes,
            "intensity": w.intensity,
            "calories_burned_est": w.calories_burned_est,
            "energy_level": w.energy_level,
            "notes": w.notes,
            "details": w.details,
            "created_at": w.created_at.isoformat() if w.created_at else None,
        }
        for w in workout_result.scalars().all()
    ]

    # Meals
    meal_result = await db.execute(
        select(MealLog)
        .where(
            MealLog.user_id == user_id,
            MealLog.created_at >= since_dt,
        )
        .order_by(MealLog.created_at.desc())
    )
    meals = [
        {
            "id": m.id,
            "date": str(m.date),
            "meal_type": m.meal_type,
            "name": m.name,
            "calories": m.calories,
            "protein_g": m.protein_g,
            "carbs_g": m.carbs_g,
            "fat_g": m.fat_g,
            "notes": m.notes,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in meal_result.scalars().all()
    ]

    # Weight logs
    weight_result = await db.execute(
        select(WeightLog)
        .where(
            WeightLog.user_id == user_id,
            WeightLog.created_at >= since_dt,
        )
        .order_by(WeightLog.created_at.desc())
    )
    weight_logs = [
        {
            "id": w.id,
            "date": str(w.date),
            "weight_kg": w.weight_kg,
            "body_fat_pct": w.body_fat_pct,
            "waist_cm": w.waist_cm,
            "notes": w.notes,
            "created_at": w.created_at.isoformat() if w.created_at else None,
        }
        for w in weight_result.scalars().all()
    ]

    # Water logs
    water_result = await db.execute(
        select(WaterLog)
        .where(
            WaterLog.user_id == user_id,
            WaterLog.created_at >= since_dt,
        )
        .order_by(WaterLog.created_at.desc())
    )
    water_logs = [
        {
            "id": w.id,
            "date": str(w.date),
            "amount_ml": w.amount_ml,
            "created_at": w.created_at.isoformat() if w.created_at else None,
        }
        for w in water_result.scalars().all()
    ]

    return SyncResponse(
        workouts=workouts,
        meals=meals,
        weight_logs=weight_logs,
        water_logs=water_logs,
        synced_at=datetime.now(timezone.utc).isoformat(),
    )
