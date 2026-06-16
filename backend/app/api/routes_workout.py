import logging
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional, List
from app.core.database import get_db
from app.core.auth import get_current_user
from app.core.limiter import limiter
from app.models.analytics import WorkoutLog, WorkoutTemplate
from app.models.fitness import PersonalRecord
from app.models.user import User
from app.services.rag import schedule_workout_embedding
from app.services.vertex_ai import analyze_workout

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/workout", tags=["workout"])

WORKOUT_TYPES = ["crossfit", "running", "football", "yoga", "cycling", "stretch",
                 "swimming", "hiit", "walking", "boxing", "pilates", "climbing"]


class PRUpsert(BaseModel):
    exercise_name: str
    weight_kg: float
    reps: int
    date: str
    notes: Optional[str] = None


class PRBulkSync(BaseModel):
    prs: List[PRUpsert]


class WorkoutTemplateCreate(BaseModel):
    name: str
    workout_type: str
    exercises: Optional[list] = None
    description: Optional[str] = None
    estimated_duration: Optional[int] = None
    tags: Optional[list] = None


class WorkoutTemplateUpdate(BaseModel):
    name: Optional[str] = None
    workout_type: Optional[str] = None
    exercises: Optional[list] = None
    description: Optional[str] = None
    estimated_duration: Optional[int] = None
    tags: Optional[list] = None


class WorkoutAnalyzeRequest(BaseModel):
    workout_type: str
    duration_minutes: int
    intensity: str = "moderate"
    description: str = ""
    details: Optional[dict] = None


class WorkoutSaveRequest(BaseModel):
    workout_type: str
    duration_minutes: int
    intensity: str = "moderate"
    description: str = ""
    details: Optional[dict] = None
    ai_analysis: Optional[dict] = None
    calories_burned_est: Optional[int] = None
    energy_level: Optional[int] = None
    # Client-local date (YYYY-MM-DD); server date is UTC and can be a day off
    date: Optional[str] = None


def _parse_client_date(raw: Optional[str]) -> date:
    if raw:
        try:
            return date.fromisoformat(raw)
        except ValueError:
            pass
    return date.today()


def _coerce_int(val):
    try:
        if val is None or val == "":
            return None
        return int(float(val))
    except (TypeError, ValueError):
        return None


def _coerce_float(val):
    try:
        if val is None or val == "":
            return None
        return float(val)
    except (TypeError, ValueError):
        return None


def _normalize_exercises(details) -> list:
    """I return a consistent exercise breakdown the client can always render.

    Workouts reach us from three places that historically stored `sets`
    differently: the live session logger (sets as a list of objects), and the
    MCP/AI logger (sets as a count + shared reps/weight). I flatten all of them
    into ``[{name, sets: [{reps, weight_kg, rpe, unit, isWarmup, notes}], notes}]``
    so the history detail screen shows every set regardless of source.
    """
    if not isinstance(details, dict):
        return []
    raw = details.get("exercises")
    if not isinstance(raw, list):
        return []

    out = []
    for ex in raw:
        if isinstance(ex, str):
            out.append({"name": ex, "sets": [], "notes": None})
            continue
        if not isinstance(ex, dict):
            continue

        name = ex.get("name") or ex.get("exercise") or "Exercise"
        unit = ex.get("unit") or "kg"
        raw_sets = ex.get("sets")
        norm_sets = []

        if isinstance(raw_sets, list):
            for s in raw_sets:
                if not isinstance(s, dict):
                    continue
                norm_sets.append({
                    "reps":      _coerce_int(s.get("reps")) or 0,
                    "weight_kg": _coerce_float(s.get("weight_kg", s.get("weight"))) or 0,
                    "rpe":       _coerce_int(s.get("rpe")),
                    "unit":      s.get("unit") or unit,
                    "isWarmup":  bool(s.get("isWarmup", False)),
                    "notes":     s.get("notes"),
                })
        elif isinstance(raw_sets, (int, float)) and raw_sets:
            # Summary form: `sets` is a count, reps/weight shared across them.
            reps = _coerce_int(ex.get("reps")) or 0
            weight = _coerce_float(ex.get("weight_kg", ex.get("weight"))) or 0
            for _ in range(int(raw_sets)):
                norm_sets.append({
                    "reps": reps, "weight_kg": weight, "rpe": None,
                    "unit": unit, "isWarmup": False, "notes": None,
                })
        elif ex.get("reps") is not None or ex.get("weight_kg") is not None:
            # A single set described inline on the exercise itself.
            norm_sets.append({
                "reps":      _coerce_int(ex.get("reps")) or 0,
                "weight_kg": _coerce_float(ex.get("weight_kg", ex.get("weight"))) or 0,
                "rpe":       _coerce_int(ex.get("rpe")),
                "unit":      unit,
                "isWarmup":  False,
                "notes":     ex.get("notes"),
            })

        out.append({"name": name, "sets": norm_sets, "notes": ex.get("notes")})
    return out


def _derive_workout_name(w: WorkoutLog) -> str:
    """I produce a human title for a logged workout for the history list."""
    details = w.details if isinstance(w.details, dict) else {}
    name = details.get("name")
    if not name and w.notes:
        # Live + MCP logs lead the notes with "<Name> — …summary".
        name = w.notes.split(" — ")[0].strip()
    if not name:
        name = (w.workout_type or "Workout").replace("_", " ").title()
    return name[:80]


@router.post("/analyze")
@limiter.limit("20/minute")
async def analyze_workout_route(
    request: Request,
    body: WorkoutAnalyzeRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I analyze a workout with AI and return calories, muscle groups, recovery info."""
    user_result = await db.execute(select(User).where(User.id == user["sub"]))
    user_obj = user_result.scalar_one_or_none()
    profile = {"current_weight_kg": user_obj.current_weight_kg if user_obj else None}

    result = await analyze_workout(
        workout_type=body.workout_type,
        duration_minutes=body.duration_minutes,
        intensity=body.intensity,
        description=body.description,
        details=body.details,
        user_profile=profile,
    )
    return result


@router.post("/")
@limiter.limit("30/minute")
async def save_workout(
    request: Request,
    entry: WorkoutSaveRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I save a completed workout to the database."""
    calories = entry.calories_burned_est
    if not calories and entry.ai_analysis:
        calories = entry.ai_analysis.get("calories_burned")

    log = WorkoutLog(
        user_id=user["sub"],
        date=_parse_client_date(entry.date),
        workout_type=entry.workout_type.lower(),
        duration_minutes=entry.duration_minutes,
        intensity=entry.intensity,
        notes=entry.description,
        details=entry.details,
        ai_analysis=entry.ai_analysis,
        calories_burned_est=calories,
        energy_level=entry.energy_level,
    )
    db.add(log)
    await db.commit()
    await db.refresh(log)
    schedule_workout_embedding(log.id)

    return {
        "id": log.id,
        "date": str(log.date),
        "type": log.workout_type,
        "duration": log.duration_minutes,
        "calories": log.calories_burned_est,
    }


@router.get("/")
@limiter.limit("100/minute")
async def get_workouts(
    request: Request,
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I return workout history with AI analysis included."""
    start = date.today() - timedelta(days=days)
    result = await db.execute(
        select(WorkoutLog)
        .where(WorkoutLog.user_id == user["sub"], WorkoutLog.date >= start)
        .order_by(WorkoutLog.date.desc())
    )
    logs = result.scalars().all()
    return {
        "workouts": [{
            "id": w.id,
            "date": str(w.date),
            # `type`/`duration` kept for back-compat; the client reads the
            # explicit `workout_type`/`duration_minutes`/`name`/`exercises`.
            "type": w.workout_type,
            "workout_type": w.workout_type,
            "duration": w.duration_minutes,
            "duration_minutes": w.duration_minutes,
            "name": _derive_workout_name(w),
            "exercises": _normalize_exercises(w.details),
            "intensity": w.intensity,
            "calories": w.calories_burned_est,
            "notes": w.notes,
            "details": w.details,
            "ai_analysis": w.ai_analysis,
            "energy_level": w.energy_level,
        } for w in logs],
        "total": len(logs),
    }


@router.get("/stats")
@limiter.limit("100/minute")
async def get_workout_stats(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I return weekly and monthly workout statistics."""
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)

    week_result = await db.execute(
        select(WorkoutLog).where(WorkoutLog.user_id == user["sub"], WorkoutLog.date >= week_start)
    )
    week_w = week_result.scalars().all()

    month_result = await db.execute(
        select(WorkoutLog).where(WorkoutLog.user_id == user["sub"], WorkoutLog.date >= month_start)
    )
    month_w = month_result.scalars().all()

    return {
        "this_week": {
            "count": len(week_w),
            "total_minutes": sum(w.duration_minutes for w in week_w),
            "total_calories": sum(w.calories_burned_est or 0 for w in week_w),
            "types": list(set(w.workout_type for w in week_w)),
        },
        "this_month": {
            "count": len(month_w),
            "total_minutes": sum(w.duration_minutes for w in month_w),
            "total_calories": sum(w.calories_burned_est or 0 for w in month_w),
        },
    }


@router.get("/templates")
@limiter.limit("100/minute")
async def get_workout_templates(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I return all saved workout templates."""
    result = await db.execute(
        select(WorkoutTemplate)
        .where(WorkoutTemplate.user_id == user["sub"])
        .order_by(WorkoutTemplate.created_at.desc())
    )
    templates = result.scalars().all()
    return {"templates": [_fmt_template(t) for t in templates]}


@router.post("/templates")
@limiter.limit("30/minute")
async def save_workout_template(
    request: Request,
    body: WorkoutTemplateCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I save a workout template (AI-suggested or user-created)."""
    t = WorkoutTemplate(
        user_id=user["sub"],
        name=body.name,
        workout_type=body.workout_type.lower(),
        exercises=body.exercises,
        description=body.description,
        estimated_duration=body.estimated_duration,
        tags=body.tags or [],
        source="ai_suggested",
    )
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return _fmt_template(t)


@router.put("/templates/{template_id}")
@limiter.limit("30/minute")
async def update_workout_template(
    request: Request,
    template_id: int,
    body: WorkoutTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I update an existing workout template."""
    result = await db.execute(
        select(WorkoutTemplate).where(
            WorkoutTemplate.id == template_id,
            WorkoutTemplate.user_id == user["sub"],
        )
    )
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    if body.name is not None: t.name = body.name
    if body.workout_type is not None: t.workout_type = body.workout_type.lower()
    if body.exercises is not None: t.exercises = body.exercises
    if body.description is not None: t.description = body.description
    if body.estimated_duration is not None: t.estimated_duration = body.estimated_duration
    if body.tags is not None: t.tags = body.tags
    await db.commit()
    await db.refresh(t)
    return _fmt_template(t)


@router.delete("/templates/{template_id}")
@limiter.limit("30/minute")
async def delete_workout_template(
    request: Request,
    template_id: int,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I delete a workout template."""
    result = await db.execute(
        select(WorkoutTemplate).where(
            WorkoutTemplate.id == template_id,
            WorkoutTemplate.user_id == user["sub"],
        )
    )
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.delete(t)
    await db.commit()
    return {"deleted": template_id}


@router.get("/prs")
@limiter.limit("100/minute")
async def get_personal_records(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I return all personal records for the user."""
    result = await db.execute(
        select(PersonalRecord)
        .where(PersonalRecord.user_id == user["sub"])
        .order_by(PersonalRecord.weight_kg.desc())
    )
    prs = result.scalars().all()
    return {"prs": [_fmt_pr(p) for p in prs]}


@router.post("/prs")
@limiter.limit("60/minute")
async def upsert_personal_record(
    request: Request,
    body: PRUpsert,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I upsert a PR — only updates if the new weight is higher than the stored record."""
    result = await db.execute(
        select(PersonalRecord).where(
            PersonalRecord.user_id == user["sub"],
            PersonalRecord.exercise_name == body.exercise_name,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        if body.weight_kg > existing.weight_kg:
            existing.weight_kg = body.weight_kg
            existing.reps = body.reps
            try:
                existing.date = date.fromisoformat(body.date)
            except ValueError:
                existing.date = date.today()
            if body.notes:
                existing.notes = body.notes
            await db.commit()
            await db.refresh(existing)
        return _fmt_pr(existing)
    else:
        try:
            pr_date = date.fromisoformat(body.date)
        except ValueError:
            pr_date = date.today()
        pr = PersonalRecord(
            user_id=user["sub"],
            exercise_name=body.exercise_name,
            weight_kg=body.weight_kg,
            reps=body.reps,
            date=pr_date,
            notes=body.notes,
        )
        db.add(pr)
        await db.commit()
        await db.refresh(pr)
        return _fmt_pr(pr)


@router.post("/prs/bulk")
@limiter.limit("30/minute")
async def bulk_sync_personal_records(
    request: Request,
    body: PRBulkSync,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I bulk-upsert PRs from the client (e.g. syncing localStorage on login)."""
    synced = 0
    for entry in body.prs:
        result = await db.execute(
            select(PersonalRecord).where(
                PersonalRecord.user_id == user["sub"],
                PersonalRecord.exercise_name == entry.exercise_name,
            )
        )
        existing = result.scalar_one_or_none()
        try:
            pr_date = date.fromisoformat(entry.date)
        except ValueError:
            pr_date = date.today()
        if existing:
            if entry.weight_kg > existing.weight_kg:
                existing.weight_kg = entry.weight_kg
                existing.reps = entry.reps
                existing.date = pr_date
                synced += 1
        else:
            db.add(PersonalRecord(
                user_id=user["sub"],
                exercise_name=entry.exercise_name,
                weight_kg=entry.weight_kg,
                reps=entry.reps,
                date=pr_date,
                notes=entry.notes,
            ))
            synced += 1
    await db.commit()
    return {"synced": synced, "total": len(body.prs)}


def _fmt_pr(p: PersonalRecord) -> dict:
    return {
        "id": p.id,
        "exercise_name": p.exercise_name,
        "weight_kg": p.weight_kg,
        "reps": p.reps,
        "date": str(p.date),
        "notes": p.notes,
    }


def _fmt_template(t: WorkoutTemplate) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "workout_type": t.workout_type,
        "exercises": t.exercises,
        "description": t.description,
        "estimated_duration": t.estimated_duration,
        "tags": t.tags or [],
    }


@router.delete("/{workout_id}")
@limiter.limit("30/minute")
async def delete_workout(
    request: Request,
    workout_id: int,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(WorkoutLog).where(WorkoutLog.id == workout_id, WorkoutLog.user_id == user["sub"])
    )
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="Workout not found")
    await db.delete(log)
    await db.commit()
    return {"deleted": workout_id}
