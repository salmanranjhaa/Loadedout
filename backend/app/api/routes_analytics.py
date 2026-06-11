import logging
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.core.auth import get_current_user
from app.core.limiter import limiter
from app.models.analytics import WeightLog, WorkoutLog, DailySnapshot
from app.models.meal import MealLog
from app.models.budget import BudgetEntry
from app.services.rag import schedule_workout_embedding

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analytics", tags=["analytics"])


class WeightEntry(BaseModel):
    weight_kg: float
    body_fat_pct: Optional[float] = None
    waist_cm: Optional[float] = None
    notes: Optional[str] = None


class WorkoutEntry(BaseModel):
    workout_type: str
    duration_minutes: int
    intensity: Optional[str] = None
    details: Optional[dict] = None
    calories_burned_est: Optional[int] = None
    energy_level: Optional[int] = None
    notes: Optional[str] = None


# I handle weight tracking
@router.post("/weight")
@limiter.limit("30/minute")
async def log_weight(
    request: Request,
    entry: WeightEntry,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I upsert today's weight — updates if a log already exists for today."""
    today = date.today()
    result = await db.execute(
        select(WeightLog).where(WeightLog.user_id == user["sub"], WeightLog.date == today)
    )
    existing = result.scalar_one_or_none()
    if existing:
        existing.weight_kg = entry.weight_kg
        if entry.body_fat_pct is not None:
            existing.body_fat_pct = entry.body_fat_pct
        if entry.waist_cm is not None:
            existing.waist_cm = entry.waist_cm
        if entry.notes is not None:
            existing.notes = entry.notes
    else:
        db.add(WeightLog(
            user_id=user["sub"],
            date=today,
            weight_kg=entry.weight_kg,
            body_fat_pct=entry.body_fat_pct,
            waist_cm=entry.waist_cm,
            notes=entry.notes,
        ))
    await db.commit()
    return {"date": str(today), "weight_kg": entry.weight_kg}


@router.get("/weight")
@limiter.limit("100/minute")
async def get_weight_history(
    request: Request,
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I return weight history for charting."""
    start = date.today() - timedelta(days=days)
    result = await db.execute(
        select(WeightLog)
        .where(WeightLog.user_id == user["sub"], WeightLog.date >= start)
        .order_by(WeightLog.date)
    )
    logs = result.scalars().all()
    return {
        "weights": [{"date": str(w.date), "weight_kg": w.weight_kg} for w in logs],
        "current": logs[-1].weight_kg if logs else None,
        "trend": _calc_trend(logs) if len(logs) >= 2 else None,
    }


# I handle workout logging
@router.post("/workout")
@limiter.limit("30/minute")
async def log_workout(
    request: Request,
    entry: WorkoutEntry,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I log a workout and embed it for RAG."""
    log = WorkoutLog(
        user_id=user["sub"],
        date=date.today(),
        workout_type=entry.workout_type,
        duration_minutes=entry.duration_minutes,
        intensity=entry.intensity,
        details=entry.details,
        calories_burned_est=entry.calories_burned_est,
        energy_level=entry.energy_level,
        notes=entry.notes,
    )
    db.add(log)
    await db.commit()
    await db.refresh(log)
    
    schedule_workout_embedding(log.id)
    
    return {
        "id": log.id,
        "date": str(log.date),
        "workout_type": log.workout_type,
        "duration_minutes": log.duration_minutes,
    }


@router.get("/workouts")
@limiter.limit("100/minute")
async def get_workout_history(
    request: Request,
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I return workout history for analytics."""
    start = date.today() - timedelta(days=days)
    result = await db.execute(
        select(WorkoutLog)
        .where(WorkoutLog.user_id == user["sub"], WorkoutLog.date >= start)
        .order_by(WorkoutLog.date.desc())
    )
    logs = result.scalars().all()
    
    # I aggregate by type
    by_type = {}
    for w in logs:
        if w.workout_type not in by_type:
            by_type[w.workout_type] = {"count": 0, "total_minutes": 0}
        by_type[w.workout_type]["count"] += 1
        by_type[w.workout_type]["total_minutes"] += w.duration_minutes
    
    return {
        "workouts": [{
            "id": w.id,
            "date": str(w.date),
            "type": w.workout_type,
            "duration": w.duration_minutes,
            "intensity": w.intensity,
            "energy": w.energy_level,
        } for w in logs],
        "summary": by_type,
        "total_sessions": len(logs),
    }


# I handle the daily dashboard snapshot
@router.get("/dashboard")
@limiter.limit("60/minute")
async def get_dashboard(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I return the main analytics dashboard data."""
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    
    # I get weight trend
    weight_result = await db.execute(
        select(WeightLog)
        .where(WeightLog.user_id == user["sub"])
        .order_by(WeightLog.date.desc())
        .limit(30)
    )
    weights = list(reversed(weight_result.scalars().all()))
    
    # I get this week's workouts
    workout_result = await db.execute(
        select(WorkoutLog)
        .where(WorkoutLog.user_id == user["sub"], WorkoutLog.date >= week_start)
    )
    week_workouts = workout_result.scalars().all()
    
    # I get this week's daily snapshots
    snapshot_result = await db.execute(
        select(DailySnapshot)
        .where(DailySnapshot.user_id == user["sub"], DailySnapshot.date >= week_start)
        .order_by(DailySnapshot.date)
    )
    snapshots = snapshot_result.scalars().all()
    
    # I get this week's meal logs for nutrition overview
    meal_result = await db.execute(
        select(MealLog).where(MealLog.user_id == user["sub"], MealLog.date >= week_start)
    )
    week_meals = meal_result.scalars().all()

    # I get this week's budget entries
    budget_result = await db.execute(
        select(BudgetEntry).where(BudgetEntry.user_id == user["sub"], BudgetEntry.date >= week_start)
    )
    week_budget = budget_result.scalars().all()
    budget_by_cat: dict = {}
    for e in week_budget:
        budget_by_cat[e.category] = round(budget_by_cat.get(e.category, 0) + e.amount, 2)

    # I aggregate nutrition by day to compute weekly averages
    days_with_meals = len(set(m.date for m in week_meals)) or 1
    total_cal = sum(m.calories or 0 for m in week_meals)
    total_pro = sum(m.protein_g or 0 for m in week_meals)

    return {
        "weight": {
            "current": weights[-1].weight_kg if weights else None,
            "week_change": round(weights[-1].weight_kg - weights[-7].weight_kg, 2) if len(weights) >= 7 else None,
            "history": [{"date": str(w.date), "kg": w.weight_kg} for w in weights],
        },
        "fitness_this_week": {
            "workouts": len(week_workouts),
            "total_minutes": sum(w.duration_minutes for w in week_workouts),
            "total_calories_burned": sum(w.calories_burned_est or 0 for w in week_workouts),
            "types": list(set(w.workout_type for w in week_workouts)),
        },
        "nutrition_this_week": {
            "avg_calories": round(total_cal / days_with_meals) if week_meals else None,
            "avg_protein": round(total_pro / days_with_meals) if week_meals else None,
            "total_meals_logged": len(week_meals),
        },
        "budget_this_week": {
            "total": round(sum(e.amount for e in week_budget), 2),
            "by_category": budget_by_cat,
            "entries": len(week_budget),
        },
        "adherence": {
            "avg_pct": (
                sum(s.adherence_pct or 0 for s in snapshots) / len(snapshots)
                if snapshots else None
            ),
        },
    }


@router.get("/adherence")
@limiter.limit("60/minute")
async def get_meal_adherence(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I return weekly meal adherence percentages (Mon–Sun) as an array of 7 floats (0.0–100.0).
    Adherence is computed per day as min(meals_logged / 3, 1.0) * 100, treating 3 meals as 100%."""
    today = date.today()
    # I align to the current Monday
    week_start = today - timedelta(days=today.weekday())

    result = await db.execute(
        select(MealLog)
        .where(MealLog.user_id == user["sub"], MealLog.date >= week_start)
    )
    meals = result.scalars().all()

    # I count meals per weekday index (0=Monday … 6=Sunday)
    counts = [0] * 7
    for m in meals:
        day_idx = (m.date - week_start).days
        if 0 <= day_idx < 7:
            counts[day_idx] += 1

    # I cap adherence at 100% and treat 3+ meals as full adherence
    adherence = [round(min(c / 3.0, 1.0) * 100, 1) for c in counts]
    return {"adherence": adherence, "week_start": str(week_start)}


def _calc_trend(logs: list[WeightLog]) -> dict:
    """I calculate the weight trend (weekly average change)."""
    if len(logs) < 2:
        return None
    first = logs[0].weight_kg
    last = logs[-1].weight_kg
    days = (logs[-1].date - logs[0].date).days or 1
    weekly_change = (last - first) / days * 7
    return {
        "weekly_change_kg": round(weekly_change, 2),
        "direction": "losing" if weekly_change < 0 else "gaining",
        "total_change_kg": round(last - first, 2),
    }
