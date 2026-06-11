import asyncio
import json
import logging
from datetime import date, datetime, timezone
from typing import Optional

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.meal import MealLog
from app.models.analytics import WorkoutLog
from app.models.schedule import ScheduleModification

logger = logging.getLogger(__name__)
settings = get_settings()

# Recency half-life: a doc this many days old scores half as relevant
_HALF_LIFE_DAYS = 14.0
_MIN_SIMILARITY = 0.25

# Query intent → per-type boost. Hybrid retrieval: cosine similarity is the
# base signal, intent keywords steer toward the right log type, recency decay
# keeps stale history from drowning out current habits.
_INTENT_KEYWORDS = {
    "meal": ["meal", "eat", "ate", "food", "diet", "calorie", "protein", "carb", "fat",
             "macro", "breakfast", "lunch", "dinner", "snack", "recipe", "hungry",
             "nutrition", "cook", "grocery", "pantry"],
    "workout": ["workout", "train", "gym", "exercise", "lift", "run", "running", "cardio",
                "strength", "pr", "sets", "reps", "muscle", "sore", "recovery", "crossfit",
                "hiit", "yoga", "bench", "squat", "deadlift"],
    "schedule_change": ["schedule", "calendar", "routine", "plan", "week", "time",
                        "morning", "evening", "appointment", "move", "reschedule"],
}


async def get_embedding(content: str) -> Optional[list[float]]:
    """I generate an embedding using Vertex AI text-embedding-004."""
    try:
        from app.services.vertex_ai import get_client
        client = get_client()
        response = await client.aio.models.embed_content(
            model="text-embedding-004",
            contents=content,
        )
        return list(response.embeddings[0].values)
    except Exception as e:
        logger.error(f"Vertex AI embedding failed: {e}")
        return None


def cosine_similarity(a: list[float], b: list[float]) -> float:
    a_arr = np.array(a)
    b_arr = np.array(b)
    norm = np.linalg.norm(a_arr) * np.linalg.norm(b_arr)
    if norm == 0:
        return 0.0
    return float(np.dot(a_arr, b_arr) / norm)


def _detect_intent_boosts(query: str) -> dict[str, float]:
    q = query.lower()
    boosts = {"meal": 1.0, "workout": 1.0, "schedule_change": 1.0}
    for doc_type, keywords in _INTENT_KEYWORDS.items():
        hits = sum(1 for kw in keywords if kw in q)
        if hits:
            boosts[doc_type] = min(1.6, 1.0 + 0.15 * hits)
    return boosts


def _recency_weight(doc_date) -> float:
    try:
        if isinstance(doc_date, datetime):
            age_days = (datetime.now(timezone.utc) - doc_date).days
        elif isinstance(doc_date, date):
            age_days = (date.today() - doc_date).days
        else:
            return 1.0
        age_days = max(age_days, 0)
        return 0.5 ** (age_days / _HALF_LIFE_DAYS)
    except Exception:
        return 1.0


def _meal_doc(meal: MealLog) -> dict:
    return {
        "type": "meal",
        "date": meal.date,
        "content": (
            f"Meal: {meal.name} ({meal.meal_type}) on {meal.date}. "
            f"Calories: {meal.calories}, Protein: {meal.protein_g}g. "
            f"Notes: {meal.notes or 'none'}"
        ),
        "embedding": meal.embedding,
        "dedupe_key": (meal.name or "").strip().lower(),
    }


def _workout_doc(workout: WorkoutLog) -> dict:
    extra = ""
    details = workout.details or {}
    exercises = details.get("exercises") if isinstance(details, dict) else None
    if exercises:
        names = ", ".join(e.get("name", "?") for e in exercises[:6] if isinstance(e, dict))
        extra = f" Exercises: {names}."
    return {
        "type": "workout",
        "date": workout.date,
        "content": (
            f"Workout: {workout.workout_type} on {workout.date}. "
            f"Duration: {workout.duration_minutes}min, Intensity: {workout.intensity}."
            f"{extra} Energy level: {workout.energy_level}/5. Notes: {workout.notes or 'none'}"
        ),
        "embedding": workout.embedding,
        "dedupe_key": f"{workout.workout_type}:{workout.date}",
    }


def _mod_doc(mod: ScheduleModification) -> dict:
    return {
        "type": "schedule_change",
        "date": getattr(mod, "created_at", None),
        "content": (
            f"Schedule change ({mod.modification_type}): {mod.reason or 'no reason given'}. "
            f"Changed: {json.dumps(mod.old_value)} -> {json.dumps(mod.new_value)}"
        ),
        "embedding": mod.embedding,
        "dedupe_key": f"mod:{mod.id}",
    }


async def retrieve_relevant_context(
    query: str,
    user_id: int,
    db: AsyncSession,
    top_k: int = 6,
) -> str:
    """I retrieve the most relevant user history with hybrid scoring.

    score = cosine_similarity × intent_boost × recency_decay, deduplicated so
    five identical chicken-and-rice logs don't fill the whole context window.
    """
    query_embedding = await get_embedding(query)
    if not query_embedding:
        return ""

    documents: list[dict] = []

    try:
        meal_result = await db.execute(
            select(MealLog)
            .where(MealLog.user_id == user_id, MealLog.embedding.isnot(None))
            .order_by(MealLog.created_at.desc())
            .limit(120)
        )
        documents.extend(_meal_doc(m) for m in meal_result.scalars())
    except Exception as e:
        logger.error(f"Failed to fetch meal logs for RAG: {e}")

    try:
        workout_result = await db.execute(
            select(WorkoutLog)
            .where(WorkoutLog.user_id == user_id, WorkoutLog.embedding.isnot(None))
            .order_by(WorkoutLog.created_at.desc())
            .limit(120)
        )
        documents.extend(_workout_doc(w) for w in workout_result.scalars())
    except Exception as e:
        logger.error(f"Failed to fetch workout logs for RAG: {e}")

    try:
        mod_result = await db.execute(
            select(ScheduleModification)
            .where(ScheduleModification.user_id == user_id, ScheduleModification.embedding.isnot(None))
            .order_by(ScheduleModification.created_at.desc())
            .limit(30)
        )
        documents.extend(_mod_doc(m) for m in mod_result.scalars())
    except Exception as e:
        logger.error(f"Failed to fetch schedule modifications for RAG: {e}")

    if not documents:
        return ""

    boosts = _detect_intent_boosts(query)
    for doc in documents:
        if doc["embedding"]:
            sim = cosine_similarity(query_embedding, doc["embedding"])
        else:
            sim = 0.0
        doc["similarity"] = sim
        doc["score"] = sim * boosts.get(doc["type"], 1.0) * _recency_weight(doc["date"])

    documents.sort(key=lambda x: x["score"], reverse=True)

    # Greedy selection with dedupe — keep only the freshest instance of
    # repeated meals/workouts so the context stays diverse.
    picked: list[dict] = []
    seen_keys: set[str] = set()
    for doc in documents:
        if doc["similarity"] < _MIN_SIMILARITY:
            continue
        if doc["dedupe_key"] in seen_keys:
            continue
        seen_keys.add(doc["dedupe_key"])
        picked.append(doc)
        if len(picked) >= top_k:
            break

    if not picked:
        return ""
    return "\n\n".join(f"[{doc['type'].upper()}] {doc['content']}" for doc in picked)


# ── Embedding writers ─────────────────────────────────────────────────────────
# Logging endpoints schedule these in the background so saving a meal/workout
# never waits on (or fails because of) the embedding call.

def schedule_meal_embedding(meal_id: int) -> None:
    asyncio.create_task(_embed_meal_by_id(meal_id))


def schedule_workout_embedding(workout_id: int) -> None:
    asyncio.create_task(_embed_workout_by_id(workout_id))


async def _embed_meal_by_id(meal_id: int) -> None:
    from app.core.database import async_session
    try:
        async with async_session() as session:
            result = await session.execute(select(MealLog).where(MealLog.id == meal_id))
            meal = result.scalar_one_or_none()
            if not meal:
                return
            content = (
                f"Ate {meal.name} for {meal.meal_type}. "
                f"Calories: {meal.calories}, Protein: {meal.protein_g}g. "
                f"{meal.notes or ''}"
            )
            embedding = await get_embedding(content)
            if embedding:
                meal.embedding = embedding
                await session.commit()
    except Exception as e:
        logger.error(f"Background embed failed for meal {meal_id}: {e}")


async def _embed_workout_by_id(workout_id: int) -> None:
    from app.core.database import async_session
    try:
        async with async_session() as session:
            result = await session.execute(select(WorkoutLog).where(WorkoutLog.id == workout_id))
            workout = result.scalar_one_or_none()
            if not workout:
                return
            content = (
                f"{workout.workout_type} workout, {workout.duration_minutes} minutes, "
                f"intensity: {workout.intensity}. Energy: {workout.energy_level}/5. "
                f"{workout.notes or ''}"
            )
            embedding = await get_embedding(content)
            if embedding:
                workout.embedding = embedding
                await session.commit()
    except Exception as e:
        logger.error(f"Background embed failed for workout {workout_id}: {e}")


# Kept for callers that still hold the object + session (schedule modifications)
async def embed_and_store_modification(mod: ScheduleModification, db: AsyncSession) -> None:
    try:
        content = (
            f"User modified schedule: {mod.modification_type}. "
            f"Reason: {mod.reason or 'not specified'}. "
            f"Old: {json.dumps(mod.old_value)}, New: {json.dumps(mod.new_value)}"
        )
        mod.embedding = await get_embedding(content)
        if mod.embedding:
            await db.commit()
    except Exception as e:
        logger.error(f"Failed to embed schedule modification {mod.id}: {e}")
