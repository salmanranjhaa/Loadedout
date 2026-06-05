import json
import logging
import os
import re
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from app.core.database import get_db
from app.core.auth import get_current_user
from app.core.limiter import limiter
from app.models.exercise import Exercise
from app.services.exercise_enrichment import enrich_exercise
from app.services.workoutx import search_exercises as wx_search, fetch_gif as wx_fetch_gif

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/exercises", tags=["exercises"])

GIF_CACHE_DIR = os.environ.get("GIF_CACHE_DIR", "/data/gifs")


class ExerciseListItem(BaseModel):
    id: str
    name: str
    body_part: str | None = None
    equipment: str | None = None
    primary_muscles: list | None = None
    level: str | None = None
    gif_url: str | None = None

    class Config:
        from_attributes = True


class ExerciseDetail(ExerciseListItem):
    secondary_muscles: list | None = None
    instructions: list | None = None
    category: str | None = None
    force: str | None = None
    mechanic: str | None = None
    llm_guidance: dict | None = None

    class Config:
        from_attributes = True


def _exercise_to_dict(e: Exercise) -> dict:
    return {
        "id": e.id,
        "name": e.name,
        "body_part": e.body_part,
        "equipment": e.equipment,
        "primary_muscles": e.primary_muscles,
        "secondary_muscles": e.secondary_muscles,
        "instructions": e.instructions,
        "level": e.level,
        "category": e.category,
        "force": e.force,
        "mechanic": e.mechanic,
        "gif_url": e.gif_url,
    }


def _wx_id_from_url(gif_url: str | None) -> str | None:
    """Extract WorkoutX exercise ID from a gifUrl like https://api.workoutxapp.com/v1/gifs/0024.gif"""
    if not gif_url:
        return None
    m = re.search(r"/gifs/([\w-]+)\.gif", gif_url)
    return m.group(1) if m else None


async def _attach_workoutx_gif(exercise: Exercise, db: AsyncSession):
    """If no gif_url, search WorkoutX and cache the result.

    Tries full name, then first 3 words, then first 2 words to maximise
    match rate against WorkoutX's simpler naming conventions.
    """
    if exercise.gif_url:
        return

    names_to_try = [exercise.name]
    words = exercise.name.split()
    if len(words) > 3:
        names_to_try.append(" ".join(words[:3]))
    if len(words) > 2:
        names_to_try.append(" ".join(words[:2]))

    all_results = []
    for q in names_to_try:
        results = await wx_search(q, limit=5)
        all_results.extend(results)
        if results:
            break  # Stop early if we got matches

    if not all_results:
        return

    # Pick best match by name similarity
    best = None
    best_score = 0
    name_lower = exercise.name.lower()
    for wx in all_results:
        wx_name = wx.get("name", "").lower()
        a = set(name_lower.split())
        b = set(wx_name.split())
        score = len(a & b) / max(len(a), len(b)) if a or b else 0
        if score > best_score:
            best_score = score
            best = wx

    if best and best_score >= 0.3:
        exercise.gif_url = best.get("gifUrl")
        exercise.name = best.get("name", exercise.name)
        exercise.body_part = best.get("bodyPart", exercise.body_part)
        exercise.equipment = best.get("equipment", exercise.equipment)
        exercise.primary_muscles = best.get("targetMuscles", exercise.primary_muscles)
        exercise.secondary_muscles = best.get("secondaryMuscles", exercise.secondary_muscles)
        exercise.instructions = best.get("instructions", exercise.instructions)
        await db.commit()


@router.get("/", response_model=dict)
@limiter.limit("60/minute")
async def list_exercises(
    request: Request,
    q: Optional[str] = Query(None, description="Search by name"),
    body_part: Optional[str] = Query(None),
    equipment: Optional[str] = Query(None),
    level: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    stmt = select(Exercise)
    count_stmt = select(func.count(Exercise.id))

    if q:
        stmt = stmt.where(Exercise.name.ilike(f"%{q}%"))
        count_stmt = count_stmt.where(Exercise.name.ilike(f"%{q}%"))
    if body_part:
        stmt = stmt.where(Exercise.body_part.ilike(body_part))
        count_stmt = count_stmt.where(Exercise.body_part.ilike(body_part))
    if equipment:
        stmt = stmt.where(Exercise.equipment.ilike(equipment))
        count_stmt = count_stmt.where(Exercise.equipment.ilike(equipment))
    if level:
        stmt = stmt.where(Exercise.level == level)
        count_stmt = count_stmt.where(Exercise.level == level)

    total_result = await db.execute(count_stmt)
    total = total_result.scalar()

    stmt = stmt.order_by(Exercise.name).offset(offset).limit(limit)
    result = await db.execute(stmt)
    items = result.scalars().all()

    return {
        "items": [_exercise_to_dict(e) for e in items],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/{exercise_id}", response_model=ExerciseDetail)
@limiter.limit("60/minute")
async def get_exercise(
    request: Request,
    exercise_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    result = await db.execute(select(Exercise).where(Exercise.id == exercise_id))
    exercise = result.scalar_one_or_none()

    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")

    # Try to fetch WorkoutX GIF if missing (respects rate limits via caching)
    await _attach_workoutx_gif(exercise, db)

    # Trigger LLM enrichment if missing
    llm_guidance = None
    if not exercise.llm_description:
        llm_guidance = await enrich_exercise(exercise, db)
    else:
        try:
            llm_guidance = json.loads(exercise.llm_description)
        except json.JSONDecodeError:
            llm_guidance = await enrich_exercise(exercise, db)

    data = _exercise_to_dict(exercise)
    data["llm_guidance"] = llm_guidance
    return data


@router.get("/{exercise_id}/gif")
@limiter.limit("120/minute")
async def get_exercise_gif(
    request: Request,
    exercise_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Proxy WorkoutX GIF with local disk caching.

    Caches the binary on disk so we only hit the WorkoutX API once per exercise.
    Returns 404 if the exercise has no mapped WorkoutX GIF.
    """
    result = await db.execute(select(Exercise).where(Exercise.id == exercise_id))
    exercise = result.scalar_one_or_none()

    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")

    # Ensure we have a WorkoutX mapping
    if not exercise.gif_url:
        await _attach_workoutx_gif(exercise, db)

    if not exercise.gif_url:
        raise HTTPException(status_code=404, detail="No GIF available for this exercise")

    # Check local disk cache
    cache_path = os.path.join(GIF_CACHE_DIR, f"{exercise_id}.gif")
    if os.path.exists(cache_path):
        def _file_iter():
            with open(cache_path, "rb") as f:
                while chunk := f.read(65536):
                    yield chunk
        return StreamingResponse(
            _file_iter(),
            media_type="image/gif",
            headers={
                "Cache-Control": "public, max-age=86400",
                "X-Cache": "HIT",
            },
        )

    # Fetch from WorkoutX and cache
    try:
        gif_bytes = await wx_fetch_gif(exercise.gif_url)
    except Exception as e:
        logger.warning("Failed to fetch GIF for %s: %s", exercise_id, e)
        raise HTTPException(status_code=502, detail="Failed to fetch GIF from upstream")

    os.makedirs(GIF_CACHE_DIR, exist_ok=True)
    with open(cache_path, "wb") as f:
        f.write(gif_bytes)

    def _mem_iter():
        yield gif_bytes

    return StreamingResponse(
        _mem_iter(),
        media_type="image/gif",
        headers={
            "Cache-Control": "public, max-age=86400",
            "X-Cache": "MISS",
        },
    )
