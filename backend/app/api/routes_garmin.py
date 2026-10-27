import hmac
from datetime import date, timedelta
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.config import get_settings
from app.core.database import get_db
from app.core.limiter import limiter
from app.models.analytics import WorkoutLog
from app.models.garmin import HealthDay
from app.services import garmin
from app.services.workout_links import auto_link, link, unlink

router = APIRouter(tags=["garmin"])
settings = get_settings()


class KeyBody(BaseModel):
    api_key: str = Field(min_length=10, max_length=500)


class SettingsBody(BaseModel):
    activities: Optional[bool] = None
    health: Optional[bool] = None
    sleep: Optional[bool] = None
    full_history: Optional[bool] = None
    auto_sync_hours: Optional[int] = Field(None, ge=0, le=24)


def _status(conn, user_id: int) -> dict:
    key, source = garmin.key_for(conn, user_id)
    return {
        "connected": key is not None,
        "key_source": source,           # "saved", "server" or None; the key itself is never sent back
        "status": conn.status if conn else "new",
        "syncing": garmin.is_syncing(user_id),
        "last_sync_at": conn.last_sync_at.isoformat() if conn and conn.last_sync_at else None,
        "last_result": conn.last_result if conn else None,
        "last_error": conn.last_error if conn else None,
        "settings": garmin.settings_of(conn),
    }


@router.get("/garmin")
@limiter.limit("60/minute")
async def get_garmin(request: Request, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    return _status(await garmin.get_connection(db, int(user["sub"])), int(user["sub"]))


@router.put("/garmin/key")
@limiter.limit("10/hour")
async def save_key(request: Request, body: KeyBody, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    """I check the key with Garmin, store it encrypted for this user only, and start a first sync."""
    user_id, key = int(user["sub"]), body.api_key.strip()
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            await garmin.Garmin(key, client).token()
    except garmin.GarminError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Could not reach Garmin to check the key. Try again later.")
    conn = await garmin.get_connection(db, user_id, create=True)
    conn.api_key_encrypted = garmin.encrypt_key(key)
    conn.settings = {**garmin.settings_of(conn), "enabled": True}
    conn.status, conn.last_error = "new" if conn.last_sync_at is None else "ok", None
    await db.commit()
    garmin.start_sync(user_id)
    return _status(conn, user_id)


@router.delete("/garmin/key")
@limiter.limit("10/hour")
async def disconnect(request: Request, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    """I forget the saved key and stop syncing. Imported workouts and health days stay."""
    user_id = int(user["sub"])
    conn = await garmin.get_connection(db, user_id, create=True)
    conn.api_key_encrypted = None
    conn.settings = {**garmin.settings_of(conn), "enabled": False}
    await db.commit()
    return _status(conn, user_id)


@router.put("/garmin/settings")
@limiter.limit("30/minute")
async def save_settings(request: Request, body: SettingsBody, db: AsyncSession = Depends(get_db),
                        user: dict = Depends(get_current_user)):
    user_id = int(user["sub"])
    conn = await garmin.get_connection(db, user_id, create=True)
    conn.settings = {**garmin.settings_of(conn), **body.model_dump(exclude_none=True)}
    await db.commit()
    return _status(conn, user_id)


@router.post("/garmin/sync")
@limiter.limit("12/hour")
async def sync_now(request: Request, full: bool = False, wait: bool = True, db: AsyncSession = Depends(get_db),
                   user: dict = Depends(get_current_user)):
    """I sync now. With wait, I answer when it is done (or after 50 s if it is a long first sync)."""
    user_id = int(user["sub"])
    if garmin.key_for(await garmin.get_connection(db, user_id), user_id)[0] is None:
        raise HTTPException(status_code=400, detail="Add your Garmin key under Profile → Full settings → Garmin first.")
    if not wait:
        garmin.start_sync(user_id, full)
        return {"status": "syncing"}
    try:
        return await garmin.sync_and_wait(user_id, full)
    except garmin.GarminError as e:
        raise HTTPException(status_code=400, detail=str(e))


def _health(row: HealthDay) -> dict:
    return {"date": row.date.isoformat(), "steps": row.steps, "step_goal": row.step_goal, "resting_hr": row.resting_hr,
            "sleep_seconds": row.sleep_seconds, "stress_avg": row.stress_avg, **(row.data or {})}


async def _health_days(db, user_id: int, start: Optional[str], end: Optional[str]) -> list:
    try:
        end_d = date.fromisoformat(end) if end else date.today()
        start_d = date.fromisoformat(start) if start else end_d - timedelta(days=13)
    except ValueError:
        raise HTTPException(status_code=400, detail="Dates must look like 2026-10-27.")
    if (end_d - start_d).days > 366:
        raise HTTPException(status_code=400, detail="Ask for a year at most.")
    rows = (await db.execute(select(HealthDay).where(
        HealthDay.user_id == user_id, HealthDay.date >= start_d, HealthDay.date <= end_d
    ).order_by(HealthDay.date))).scalars().all()
    return [_health(r) for r in rows]


@router.get("/health/days")
@limiter.limit("100/minute")
async def health_days(request: Request, start: Optional[str] = None, end: Optional[str] = None,
                      db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    """Days of watch data (steps, heart rate, sleep, body battery, stress), oldest first. Default: the last 14."""
    return {"days": await _health_days(db, int(user["sub"]), start, end)}


# ---- internal: called by the MCP server for Claude, never by the app ----

def internal(x_internal_token: str = Header("")):
    if not settings.INTERNAL_API_TOKEN or not hmac.compare_digest(x_internal_token, settings.INTERNAL_API_TOKEN):
        raise HTTPException(status_code=403, detail="Not allowed.")


class InternalSync(BaseModel):
    user_id: int
    full: bool = False


class InternalLink(BaseModel):
    user_id: int
    workout_id: int
    other_workout_id: Optional[int] = None


async def _owned(db, user_id: int, workout_id: int) -> WorkoutLog:
    w = (await db.execute(select(WorkoutLog).where(
        WorkoutLog.id == workout_id, WorkoutLog.user_id == user_id))).scalar_one_or_none()
    if w is None:
        raise HTTPException(status_code=404, detail=f"No workout {workout_id} for this user.")
    return w


async def _as_user(db, user_id: int):
    await db.execute(text(f"SET LOCAL app.current_user_id = {int(user_id)}"))


@router.post("/internal/garmin/sync", dependencies=[Depends(internal)])
async def internal_sync(body: InternalSync, db: AsyncSession = Depends(get_db)):
    if garmin.key_for(await garmin.get_connection(db, body.user_id), body.user_id)[0] is None:
        raise HTTPException(status_code=400, detail="No Garmin key for this user: add one in the app under Profile → Full settings → Garmin.")
    try:
        return await garmin.sync_and_wait(body.user_id, body.full)
    except garmin.GarminError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/internal/workouts/link", dependencies=[Depends(internal)])
async def internal_link(body: InternalLink, db: AsyncSession = Depends(get_db)):
    """With other_workout_id: link the two. Without: link with the clear match, if any."""
    await _as_user(db, body.user_id)
    w = await _owned(db, body.user_id, body.workout_id)
    try:
        if body.other_workout_id is not None:
            kept, linked = await link(db, w, await _owned(db, body.user_id, body.other_workout_id)), True
        else:
            kept, linked = await auto_link(db, w)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    await db.commit()
    return {"linked": linked, "workout_id": kept.id, "suggestions": (kept.details or {}).get("link_suggestions", [])}


@router.post("/internal/workouts/unlink", dependencies=[Depends(internal)])
async def internal_unlink(body: InternalLink, db: AsyncSession = Depends(get_db)):
    await _as_user(db, body.user_id)
    try:
        a, b = await unlink(db, await _owned(db, body.user_id, body.workout_id))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    await db.commit()
    return {"workout_ids": [a.id, b.id]}
