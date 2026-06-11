import logging
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.core.auth import get_current_user
from app.core.limiter import limiter
from app.models.meal import MealTemplate, MealLog
from app.services.rag import embed_and_store_meal

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/meals", tags=["meals"])


class MealLogCreate(BaseModel):
    meal_type: str
    template_id: Optional[int] = None
    name: str
    calories: float
    protein_g: float
    carbs_g: Optional[float] = None
    fat_g: Optional[float] = None
    custom_ingredients: Optional[list] = None
    notes: Optional[str] = None
    # Client-local date (YYYY-MM-DD); server date is UTC and can be a day off
    date: Optional[str] = None


def _parse_client_date(raw: Optional[str]) -> date:
    if raw:
        try:
            return date.fromisoformat(raw)
        except ValueError:
            pass
    return date.today()


class ManualMealEntry(BaseModel):
    """I allow the user to describe a meal in free text for AI macro estimation."""
    description: str
    meal_type: str


class MealTemplateCreate(BaseModel):
    name: str
    meal_type: str
    calories: float
    protein_g: float
    carbs_g: Optional[float] = None
    fat_g: Optional[float] = None
    fiber_g: Optional[float] = None
    ingredients: Optional[list] = []
    prep_instructions: Optional[str] = None


class MealTemplateUpdate(BaseModel):
    name: Optional[str] = None
    meal_type: Optional[str] = None
    calories: Optional[float] = None
    protein_g: Optional[float] = None
    carbs_g: Optional[float] = None
    fat_g: Optional[float] = None
    ingredients: Optional[list] = None
    prep_instructions: Optional[str] = None


@router.post("/templates")
@limiter.limit("30/minute")
async def create_meal_template(
    request: Request,
    template: MealTemplateCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I save a meal template (e.g. suggested by the AI assistant)."""
    t = MealTemplate(
        user_id=user["sub"],
        name=template.name,
        meal_type=template.meal_type,
        calories=template.calories,
        protein_g=template.protein_g,
        carbs_g=template.carbs_g,
        fat_g=template.fat_g,
        fiber_g=template.fiber_g,
        ingredients=template.ingredients or [],
        prep_instructions=template.prep_instructions,
        source="ai_suggested",
    )
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return {"id": t.id, "name": t.name, "calories": t.calories, "protein_g": t.protein_g}


@router.get("/templates")
@limiter.limit("100/minute")
async def get_meal_templates(
    request: Request,
    meal_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I return all meal templates, optionally filtered by type."""
    query = select(MealTemplate).where(
        MealTemplate.user_id == user["sub"],
        MealTemplate.is_active == True,
    )
    if meal_type:
        query = query.where(MealTemplate.meal_type == meal_type)
    
    result = await db.execute(query)
    templates = result.scalars().all()
    
    return {"templates": [_format_template(t) for t in templates]}


@router.put("/templates/{template_id}")
@limiter.limit("30/minute")
async def update_meal_template(
    request: Request,
    template_id: int,
    body: MealTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I update an existing meal template."""
    result = await db.execute(
        select(MealTemplate).where(MealTemplate.id == template_id, MealTemplate.user_id == user["sub"])
    )
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    if body.name is not None: t.name = body.name
    if body.meal_type is not None: t.meal_type = body.meal_type
    if body.calories is not None: t.calories = body.calories
    if body.protein_g is not None: t.protein_g = body.protein_g
    if body.carbs_g is not None: t.carbs_g = body.carbs_g
    if body.fat_g is not None: t.fat_g = body.fat_g
    if body.ingredients is not None: t.ingredients = body.ingredients
    if body.prep_instructions is not None: t.prep_instructions = body.prep_instructions
    await db.commit()
    await db.refresh(t)
    return _format_template(t)


@router.delete("/templates/{template_id}")
@limiter.limit("30/minute")
async def delete_meal_template(
    request: Request,
    template_id: int,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I soft-delete a meal template by setting is_active=False."""
    result = await db.execute(
        select(MealTemplate).where(MealTemplate.id == template_id, MealTemplate.user_id == user["sub"])
    )
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    t.is_active = False
    await db.commit()
    return {"deleted": template_id}


class MealLogUpdate(BaseModel):
    name: Optional[str] = None
    meal_type: Optional[str] = None
    calories: Optional[float] = None
    protein_g: Optional[float] = None
    carbs_g: Optional[float] = None
    fat_g: Optional[float] = None


@router.put("/log/{log_id}")
@limiter.limit("30/minute")
async def update_meal_log(
    request: Request,
    log_id: int,
    body: MealLogUpdate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I update name and/or macros for an existing meal log entry."""
    result = await db.execute(
        select(MealLog).where(MealLog.id == log_id, MealLog.user_id == user["sub"])
    )
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="Meal log not found")
    fields_set = getattr(body, "model_fields_set", getattr(body, "__fields_set__", set()))
    if "name" in fields_set and body.name is not None: log.name = body.name
    if "meal_type" in fields_set and body.meal_type is not None: log.meal_type = body.meal_type
    if "calories" in fields_set and body.calories is not None: log.calories = body.calories
    if "protein_g" in fields_set and body.protein_g is not None: log.protein_g = body.protein_g
    if "carbs_g" in fields_set: log.carbs_g = body.carbs_g
    if "fat_g" in fields_set: log.fat_g = body.fat_g
    await db.commit()
    await db.refresh(log)
    return _format_log(log)


@router.delete("/log/{log_id}")
@limiter.limit("30/minute")
async def delete_meal_log(
    request: Request,
    log_id: int,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I remove a meal log entry."""
    result = await db.execute(
        select(MealLog).where(MealLog.id == log_id, MealLog.user_id == user["sub"])
    )
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="Meal log not found")
    await db.delete(log)
    await db.commit()
    return {"deleted": log_id}


@router.post("/log")
@limiter.limit("30/minute")
async def log_meal(
    request: Request,
    meal: MealLogCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I log a meal and update the daily snapshot."""
    log = MealLog(
        user_id=user["sub"],
        date=_parse_client_date(meal.date),
        meal_type=meal.meal_type,
        template_id=meal.template_id,
        name=meal.name,
        calories=meal.calories,
        protein_g=meal.protein_g,
        carbs_g=meal.carbs_g,
        fat_g=meal.fat_g,
        custom_ingredients=meal.custom_ingredients,
        notes=meal.notes,
    )
    db.add(log)
    await db.commit()
    await db.refresh(log)
    
    # I embed the meal log for RAG in the background
    await embed_and_store_meal(log, db)
    
    return _format_log(log)


@router.post("/log-manual")
@limiter.limit("30/minute")
async def log_meal_manual(
    request: Request,
    entry: ManualMealEntry,
    _db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    """
    I accept a free text description and use Vertex AI to estimate macros.
    The user can then confirm or adjust before saving.
    """
    from app.services.vertex_ai import calculate_macros_from_description
    
    estimation = await calculate_macros_from_description(entry.description)
    
    if "error" in estimation:
        raise HTTPException(status_code=422, detail=estimation["error"])
    
    # I return the estimation for user confirmation
    return {
        "estimated": estimation,
        "meal_type": entry.meal_type,
        "status": "pending_confirmation",
        "message": "Review the estimated macros and confirm or adjust.",
    }


@router.get("/today")
@limiter.limit("100/minute")
async def get_today_meals(
    request: Request,
    date_param: Optional[str] = Query(None, alias="date"),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I return all meals logged on the given day (client-local) with running totals."""
    target_date = _parse_client_date(date_param)
    result = await db.execute(
        select(MealLog)
        .where(MealLog.user_id == user["sub"], MealLog.date == target_date)
        .order_by(MealLog.created_at)
    )
    meals = result.scalars().all()
    
    total_calories = sum(m.calories for m in meals)
    total_protein = sum(m.protein_g for m in meals)
    total_carbs = sum(m.carbs_g or 0 for m in meals)
    total_fat = sum(m.fat_g or 0 for m in meals)
    
    return {
        "meals": [_format_log(m) for m in meals],
        "totals": {
            "calories": total_calories,
            "protein_g": total_protein,
            "carbs_g": total_carbs,
            "fat_g": total_fat,
            "meals_count": len(meals),
        },
    }


@router.get("/history")
@limiter.limit("100/minute")
async def get_meal_history(
    request: Request,
    days: int = 7,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I return meal history for the specified number of days."""
    from datetime import timedelta
    start_date = date.today() - timedelta(days=days)
    
    result = await db.execute(
        select(MealLog)
        .where(
            MealLog.user_id == user["sub"],
            MealLog.date >= start_date,
        )
        .order_by(MealLog.date.desc(), MealLog.created_at)
    )
    meals = result.scalars().all()
    
    # I group by date
    by_date = {}
    for m in meals:
        d = str(m.date)
        if d not in by_date:
            by_date[d] = {"meals": [], "total_calories": 0, "total_protein": 0}
        by_date[d]["meals"].append(_format_log(m))
        by_date[d]["total_calories"] += m.calories
        by_date[d]["total_protein"] += m.protein_g
    
    return {"history": by_date}


def _format_template(t: MealTemplate) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "meal_type": t.meal_type,
        "calories": t.calories,
        "protein_g": t.protein_g,
        "carbs_g": t.carbs_g,
        "fat_g": t.fat_g,
        "fiber_g": t.fiber_g,
        "ingredients": t.ingredients,
        "prep_instructions": t.prep_instructions,
        "prep_time_minutes": t.prep_time_minutes,
        "source": t.source,
    }


def _format_log(m: MealLog) -> dict:
    return {
        "id": m.id,
        "date": str(m.date),
        "meal_type": m.meal_type,
        "name": m.name,
        "calories": m.calories,
        "protein_g": m.protein_g,
        "carbs_g": m.carbs_g,
        "fat_g": m.fat_g,
        "notes": m.notes,
    }
