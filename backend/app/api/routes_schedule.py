from datetime import date as date_cls, time
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, func, or_, select
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.core.auth import get_current_user
from app.core.limiter import limiter
from app.models.schedule import ScheduleEvent, ScheduleModification, EventType
from app.services.google_calendar import get_google_calendar_status, sync_google_calendar
from app.services.rag import embed_and_store_modification

router = APIRouter(prefix="/schedule", tags=["schedule"])


class EventCreate(BaseModel):
    title: str
    description: Optional[str] = None
    event_type: str
    day_of_week: Optional[int] = None
    start_time: str  # "HH:MM"
    end_time: str
    location: Optional[str] = None
    event_data: dict = {}


class EventUpdate(BaseModel):
    title: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    description: Optional[str] = None
    event_data: Optional[dict] = None
    reason: Optional[str] = None  # I ask the user why they changed it for RAG learning


class GoogleCalendarSyncRequest(BaseModel):
    days_back: int = 1
    days_ahead: int = 30


@router.get("/")
@limiter.limit("100/minute")
async def get_schedule(
    request: Request,
    day: Optional[int] = None,
    target_date: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I return the full weekly schedule, optionally filtered by day."""
    query = select(ScheduleEvent).where(
        ScheduleEvent.user_id == user["sub"],
        ScheduleEvent.is_active == True,
    )

    parsed_date: Optional[date_cls] = None
    if target_date:
        try:
            parsed_date = date_cls.fromisoformat(target_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid target_date format. Use YYYY-MM-DD.")

    if day is not None:
        if parsed_date:
            day_idx = parsed_date.weekday()
            if day_idx != day:
                raise HTTPException(status_code=400, detail="day does not match target_date weekday")
            query = query.where(
                or_(
                    and_(ScheduleEvent.specific_date.is_(None), ScheduleEvent.day_of_week == day),
                    and_(
                        ScheduleEvent.specific_date.isnot(None),
                        func.date(ScheduleEvent.specific_date) == parsed_date,
                    ),
                )
            )
        else:
            query = query.where(ScheduleEvent.day_of_week == day)
    elif parsed_date:
        day_idx = parsed_date.weekday()
        query = query.where(
            or_(
                and_(ScheduleEvent.specific_date.is_(None), ScheduleEvent.day_of_week == day_idx),
                and_(
                    ScheduleEvent.specific_date.isnot(None),
                    func.date(ScheduleEvent.specific_date) == parsed_date,
                ),
            )
        )

    query = query.order_by(ScheduleEvent.day_of_week, ScheduleEvent.start_time)
    
    result = await db.execute(query)
    events = result.scalars().all()
    
    return {"events": [_format_event(e) for e in events]}


@router.get("/google/status")
@limiter.limit("30/minute")
async def google_calendar_status(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I return whether Google Calendar is connected for this user."""
    return await get_google_calendar_status(db, user["sub"])


@router.post("/google/sync")
@limiter.limit("10/minute")
async def google_calendar_sync(
    request: Request,
    body: GoogleCalendarSyncRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I sync events from Google Calendar into schedule events."""
    if body.days_back < 0 or body.days_back > 30:
        raise HTTPException(status_code=400, detail="days_back must be between 0 and 30")
    if body.days_ahead < 1 or body.days_ahead > 365:
        raise HTTPException(status_code=400, detail="days_ahead must be between 1 and 365")
    try:
        result = await sync_google_calendar(
            db,
            user_id=user["sub"],
            days_back=body.days_back,
            days_ahead=body.days_ahead,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True, **result}


@router.post("/")
@limiter.limit("30/minute")
async def create_event(
    request: Request,
    event: EventCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I create a new schedule event."""
    db_event = ScheduleEvent(
        user_id=user["sub"],
        title=event.title,
        description=event.description,
        event_type=EventType(event.event_type),
        day_of_week=event.day_of_week,
        start_time=time.fromisoformat(event.start_time),
        end_time=time.fromisoformat(event.end_time),
        location=event.location,
        event_data=event.event_data,
    )
    db.add(db_event)
    await db.commit()
    await db.refresh(db_event)
    return _format_event(db_event)


@router.put("/{event_id}")
@limiter.limit("30/minute")
async def update_event(
    request: Request,
    event_id: int,
    update: EventUpdate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I update an event and log the modification for RAG learning."""
    result = await db.execute(
        select(ScheduleEvent).where(
            ScheduleEvent.id == event_id,
            ScheduleEvent.user_id == user["sub"],
        )
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # I capture old values before updating
    old_values = {
        "title": event.title,
        "start_time": str(event.start_time),
        "end_time": str(event.end_time),
    }
    
    # I apply the updates
    new_values = {}
    if update.title:
        event.title = update.title
        new_values["title"] = update.title
    if update.start_time:
        event.start_time = time.fromisoformat(update.start_time)
        new_values["start_time"] = update.start_time
    if update.end_time:
        event.end_time = time.fromisoformat(update.end_time)
        new_values["end_time"] = update.end_time
    if update.description is not None:
        event.description = update.description
    if update.event_data is not None:
        event.event_data = update.event_data
    
    event.is_user_modified = True
    
    # I log the modification for RAG
    if new_values:
        mod = ScheduleModification(
            user_id=user["sub"],
            event_id=event_id,
            modification_type="update",
            old_value=old_values,
            new_value=new_values,
            reason=update.reason,
        )
        db.add(mod)
        
        # I embed the modification asynchronously for RAG retrieval
        await db.commit()
        await embed_and_store_modification(mod, db)
    
    await db.commit()
    return _format_event(event)


@router.delete("/{event_id}")
@limiter.limit("30/minute")
async def delete_event(
    request: Request,
    event_id: int,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I soft delete an event."""
    result = await db.execute(
        select(ScheduleEvent).where(
            ScheduleEvent.id == event_id,
            ScheduleEvent.user_id == user["sub"],
        )
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    event.is_active = False
    await db.commit()
    return {"status": "deleted"}


def _format_event(e: ScheduleEvent) -> dict:
    return {
        "id": e.id,
        "title": e.title,
        "description": e.description,
        "event_type": e.event_type.value if e.event_type else None,
        "day_of_week": e.day_of_week,
        "start_time": str(e.start_time) if e.start_time else None,
        "end_time": str(e.end_time) if e.end_time else None,
        "location": e.location,
        "event_data": e.event_data,
        "specific_date": e.specific_date.isoformat() if e.specific_date else None,
        "is_user_modified": e.is_user_modified,
    }
