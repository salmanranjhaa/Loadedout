import json
import logging
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.user import User
from app.models.meal import MealTemplate, MealLog
from app.models.inventory import InventoryItem
from app.models.schedule import ScheduleEvent
from app.models.analytics import WorkoutLog, WeightLog
from app.models.fitness import PersonalRecord
from app.services.vertex_ai import chat_with_ai, chat_with_ai_stream, calculate_macros_from_description
from app.services.rag import retrieve_relevant_context
from app.core.limiter import limiter

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai", tags=["ai"])


class ChatMessage(BaseModel):
    message: str
    conversation_history: Optional[list[dict]] = None
    context_type: Optional[str] = None
    # Client-local date so "today" matches the user's timezone, not UTC
    client_date: Optional[str] = None


def _profile_dict(user_profile: User) -> dict:
    return {
        "username": user_profile.username,
        "current_weight_kg": user_profile.current_weight_kg,
        "target_weight_kg": user_profile.target_weight_kg,
        "height_cm": user_profile.height_cm,
        "age": user_profile.age,
        "gender": user_profile.gender,
        "daily_calorie_target": user_profile.daily_calorie_target,
        "daily_protein_target": user_profile.daily_protein_target,
        "daily_carb_target": user_profile.daily_carb_target,
        "daily_fat_target": user_profile.daily_fat_target,
        "preferred_currency": user_profile.preferred_currency,
        "dietary_preferences": user_profile.dietary_preferences,
        "supplements": user_profile.supplements,
        "routine_preferences": user_profile.routine_preferences,
        "grocery_stores": user_profile.grocery_stores,
    }


def _parse_client_date(raw: Optional[str]) -> date:
    if raw:
        try:
            return date.fromisoformat(raw)
        except ValueError:
            pass
    return date.today()


async def _build_full_context(db: AsyncSession, user_id: int, message: str, today: date, profile: User) -> str:
    """I assemble the AI's full picture of the user: RAG hits plus live state
    (today's meals vs targets, schedule, recent training, weight trend, PRs, pantry)."""
    context = await retrieve_relevant_context(query=message, user_id=user_id, db=db, top_k=6)

    # Today's meals + remaining macro budget
    today_meals = await db.execute(
        select(MealLog).where(MealLog.user_id == user_id, MealLog.date == today)
    )
    today_meals_list = today_meals.scalars().all()
    if today_meals_list:
        meals_lines = "\n".join([
            f"  {m.meal_type}: {m.name} ({m.calories} kcal, {m.protein_g}g protein)"
            for m in today_meals_list
        ])
        total_cal = sum(m.calories for m in today_meals_list)
        total_pro = sum(m.protein_g for m in today_meals_list)
        remaining = ""
        if profile.daily_calorie_target:
            remaining = (
                f" Remaining today: {max(profile.daily_calorie_target - total_cal, 0):.0f} kcal"
                + (f", {max((profile.daily_protein_target or 0) - total_pro, 0):.0f}g protein" if profile.daily_protein_target else "")
                + "."
            )
        context += f"\n\nTODAY'S MEALS SO FAR ({total_cal:.0f} kcal, {total_pro:.0f}g protein).{remaining}\n{meals_lines}"

    # Today's schedule
    schedule_result = await db.execute(
        select(ScheduleEvent)
        .where(ScheduleEvent.user_id == user_id, ScheduleEvent.day_of_week == today.weekday())
        .order_by(ScheduleEvent.start_time)
    )
    schedule_events = schedule_result.scalars().all()
    if schedule_events:
        sched_lines = "\n".join([
            f"  {str(e.start_time or '')[:5]}-{str(e.end_time or '')[:5]}: {e.title} ({e.event_type})"
            + (f" @ {e.location}" if e.location else "")
            for e in schedule_events
        ])
        context += f"\n\nTODAY'S SCHEDULE:\n{sched_lines}"

    # Recent workouts incl. strength session details
    week_ago = today - timedelta(days=7)
    recent_workouts_result = await db.execute(
        select(WorkoutLog)
        .where(WorkoutLog.user_id == user_id, WorkoutLog.date >= week_ago)
        .order_by(WorkoutLog.date.desc())
        .limit(10)
    )
    recent_workouts = recent_workouts_result.scalars().all()
    if recent_workouts:
        lines = []
        for w in recent_workouts:
            line = f"  {w.date}: {w.workout_type} {w.duration_minutes}min, {w.intensity} intensity"
            if w.calories_burned_est is not None:
                line += f", ~{w.calories_burned_est} kcal"
            details = w.details or {}
            exercises = details.get("exercises") if isinstance(details, dict) else None
            if exercises:
                names = ", ".join(e.get("name", "?") for e in exercises[:5] if isinstance(e, dict))
                line += f" [{names}]"
            lines.append(line)
        context += "\n\nRECENT WORKOUTS (last 7 days):\n" + "\n".join(lines)

    # Weight trend
    weights_result = await db.execute(
        select(WeightLog)
        .where(WeightLog.user_id == user_id)
        .order_by(WeightLog.date.desc())
        .limit(30)
    )
    weights = weights_result.scalars().all()
    if weights:
        latest = weights[0]
        line = f"\n\nWEIGHT: {latest.weight_kg}kg on {latest.date}"
        month_old = [w for w in weights if (today - w.date).days >= 25]
        week_old = [w for w in weights if 6 <= (today - w.date).days <= 10]
        if week_old:
            line += f" ({latest.weight_kg - week_old[0].weight_kg:+.1f}kg vs last week)"
        if month_old:
            line += f" ({latest.weight_kg - month_old[0].weight_kg:+.1f}kg vs last month)"
        if profile.target_weight_kg:
            line += f". Target: {profile.target_weight_kg}kg ({latest.weight_kg - profile.target_weight_kg:+.1f}kg to go)"
        context += line

    # Personal records
    prs_result = await db.execute(
        select(PersonalRecord)
        .where(PersonalRecord.user_id == user_id)
        .order_by(PersonalRecord.weight_kg.desc())
        .limit(8)
    )
    prs = prs_result.scalars().all()
    if prs:
        pr_line = ", ".join(f"{p.exercise_name} {p.weight_kg}kg×{p.reps}" for p in prs)
        context += f"\n\nPERSONAL RECORDS: {pr_line}"

    # Pantry
    inventory_result = await db.execute(
        select(InventoryItem).where(InventoryItem.user_id == user_id)
        .order_by(InventoryItem.category, InventoryItem.name)
    )
    inventory_items = inventory_result.scalars().all()
    if inventory_items:
        inv_lines = ", ".join([
            f"{i.name}" + (f" ({i.quantity}{i.unit})" if i.quantity else "")
            for i in inventory_items
        ])
        context += f"\n\nCURRENT PANTRY/INVENTORY: {inv_lines}"

    return context


class MealSwapRequest(BaseModel):
    current_meal_id: int
    reason: Optional[str] = None
    preferences: Optional[str] = None


@router.post("/chat")
@limiter.limit("20/minute")
async def ai_chat(
    request: Request,
    chat: ChatMessage,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I handle the main AI chatbot interaction with full context injection."""
    user_result = await db.execute(select(User).where(User.id == user["sub"]))
    user_profile = user_result.scalar_one_or_none()
    if not user_profile:
        raise HTTPException(status_code=404, detail="User not found")

    today = _parse_client_date(chat.client_date)
    rag_context = await _build_full_context(db, user["sub"], chat.message, today, user_profile)

    try:
        response = await chat_with_ai(
            message=chat.message,
            user_profile=_profile_dict(user_profile),
            conversation_history=chat.conversation_history,
            rag_context=rag_context,
        )
    except Exception as e:
        logger.error(f"Vertex AI chat failed: {type(e).__name__}: {e}")
        raise HTTPException(status_code=502, detail=f"AI service error: {type(e).__name__}: {e}")

    return {
        "reply": response["text"],
        "structured_data": response.get("structured_data"),
        "rag_context_used": bool(rag_context),
    }


@router.post("/chat/stream")
@limiter.limit("20/minute")
async def ai_chat_stream(
    request: Request,
    chat: ChatMessage,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I stream the chat reply as Server-Sent Events (delta / action / done)."""
    user_result = await db.execute(select(User).where(User.id == user["sub"]))
    user_profile = user_result.scalar_one_or_none()
    if not user_profile:
        raise HTTPException(status_code=404, detail="User not found")

    today = _parse_client_date(chat.client_date)
    rag_context = await _build_full_context(db, user["sub"], chat.message, today, user_profile)
    profile_dict = _profile_dict(user_profile)

    async def event_source():
        try:
            async for event in chat_with_ai_stream(
                message=chat.message,
                user_profile=profile_dict,
                conversation_history=chat.conversation_history,
                rag_context=rag_context,
            ):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:
            logger.error(f"Chat stream failed: {type(e).__name__}: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': 'AI service error'})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/swap-meal")
@limiter.limit("10/minute")
async def swap_meal(
    request: Request,
    body: MealSwapRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I handle a meal swap request and suggest alternatives via AI."""
    template_result = await db.execute(
        select(MealTemplate).where(
            MealTemplate.id == body.current_meal_id,
            MealTemplate.user_id == user["sub"],
        )
    )
    current_meal = template_result.scalar_one_or_none()
    if not current_meal:
        raise HTTPException(status_code=404, detail="Meal template not found")

    user_result = await db.execute(select(User).where(User.id == user["sub"]))
    user_profile = user_result.scalar_one_or_none()

    swap_prompt = f"""The user wants to swap their current meal:
Current: {current_meal.name} ({current_meal.calories} kcal, {current_meal.protein_g}g protein)
Ingredients: {current_meal.ingredients}

User's reason: {body.reason or "wants variety"}
Preferences: {body.preferences or "similar macros, different taste"}

Suggest 2-3 alternative meals that match the macro range and are halal/Swiss-available.
Respond with a JSON array of meal suggestions using the save_meal_template format."""

    response = await chat_with_ai(message=swap_prompt, user_profile=_profile_dict(user_profile))

    return {
        "current_meal": {
            "id": current_meal.id,
            "name": current_meal.name,
            "calories": current_meal.calories,
            "protein_g": current_meal.protein_g,
        },
        "suggestions": response.get("structured_data") or response["text"],
    }


@router.post("/estimate-macros")
@limiter.limit("30/minute")
async def estimate_macros(
    request: Request,
    description: str,
    _user: dict = Depends(get_current_user),
):
    """I estimate macros from a free text food description using Gemini."""
    result = await calculate_macros_from_description(description)
    return result
