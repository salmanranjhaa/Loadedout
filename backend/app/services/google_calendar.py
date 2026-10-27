import asyncio
import logging
from datetime import date, datetime, time, timedelta, timezone
from urllib.parse import quote
from zoneinfo import ZoneInfo
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import async_session
from app.models.google_oauth import GoogleOAuthToken
from app.models.schedule import EventType, RecurrenceType, ScheduleEvent
from app.services.google_oauth import refresh_google_access_token

logger = logging.getLogger(__name__)

GOOGLE_CALENDAR_LIST_URL = "https://www.googleapis.com/calendar/v3/users/me/calendarList"
GOOGLE_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/{}/events"
CALENDAR_READONLY_SCOPE = "https://www.googleapis.com/auth/calendar.readonly"
CALENDAR_FULL_SCOPE = "https://www.googleapis.com/auth/calendar"
AUTO_SYNC_EVERY = timedelta(hours=3)


def _parse_google_datetime(raw: str) -> datetime:
    value = (raw or "").strip()
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _event_type_from_summary(summary: str | None) -> EventType:
    text = (summary or "").lower()
    if any(k in text for k in ["run", "crossfit", "gym", "workout", "football", "cycling", "yoga", "swim"]):
        return EventType.EXERCISE
    if any(k in text for k in ["breakfast", "lunch", "dinner", "meal", "snack"]):
        return EventType.MEAL
    if any(k in text for k in ["class", "lecture", "seminar", "course"]):
        return EventType.CLASS
    if any(k in text for k in ["meeting", "work", "project", "thesis"]):
        return EventType.WORK
    if any(k in text for k in ["chess", "party", "hangout", "social"]):
        return EventType.SOCIAL
    return EventType.ROUTINE


def _scope_set(raw_scopes: str | None) -> set[str]:
    if not raw_scopes:
        return set()
    return {part.strip() for part in raw_scopes.replace(",", " ").split() if part.strip()}


def _has_calendar_scope(raw_scopes: str | None) -> bool:
    scopes = _scope_set(raw_scopes)
    return CALENDAR_READONLY_SCOPE in scopes or CALENDAR_FULL_SCOPE in scopes


async def _ensure_access_token(db: AsyncSession, token_row: GoogleOAuthToken) -> str:
    now = datetime.now(timezone.utc)
    if token_row.access_token and (
        token_row.token_expiry is None or token_row.token_expiry > (now + timedelta(seconds=90))
    ):
        return token_row.access_token

    if not token_row.refresh_token:
        raise RuntimeError("Google token expired and no refresh token is available.")

    refreshed = await refresh_google_access_token(token_row.refresh_token)
    token_row.access_token = refreshed.get("access_token", "") or token_row.access_token
    if refreshed.get("refresh_token"):
        token_row.refresh_token = refreshed["refresh_token"]
    expires_in = refreshed.get("expires_in")
    if expires_in:
        try:
            token_row.token_expiry = now + timedelta(seconds=int(expires_in))
        except (TypeError, ValueError):
            pass
    if refreshed.get("scope"):
        token_row.scopes = refreshed["scope"]

    await db.commit()
    await db.refresh(token_row)
    return token_row.access_token


def _event_time_fields(event: dict) -> tuple[int, datetime, time, time]:
    start = event.get("start") or {}
    end = event.get("end") or {}

    # All-day event
    if start.get("date"):
        event_date = date.fromisoformat(start["date"])
        specific_date = datetime.combine(event_date, time(0, 0), tzinfo=timezone.utc)
        return event_date.weekday(), specific_date, time(0, 0), time(23, 59)

    start_raw = start.get("dateTime")
    if not start_raw:
        raise ValueError("Google event missing start")
    end_raw = end.get("dateTime")

    start_dt = _parse_google_datetime(start_raw)
    end_dt = _parse_google_datetime(end_raw) if end_raw else (start_dt + timedelta(minutes=30))

    tz_name = start.get("timeZone") or end.get("timeZone")
    if tz_name:
        try:
            zone = ZoneInfo(tz_name)
            start_dt = start_dt.astimezone(zone)
            end_dt = end_dt.astimezone(zone)
        except Exception:
            pass

    if end_dt <= start_dt:
        end_dt = start_dt + timedelta(minutes=30)

    # The schedule matches days by the UTC date of specific_date, so store the
    # event's own calendar date at UTC midnight (as all-day events do). The
    # real instant put 00:30 Zurich time on the previous day.
    return (
        start_dt.weekday(),
        datetime.combine(start_dt.date(), time(0, 0), tzinfo=timezone.utc),
        start_dt.time().replace(second=0, microsecond=0, tzinfo=None),
        end_dt.time().replace(second=0, microsecond=0, tzinfo=None),
    )


async def _fetch_calendars(access_token: str) -> list[dict]:
    """The calendars the user has switched on in Google Calendar (their own,
    shared and subscribed ones, like a sports or holiday calendar)."""
    headers = {"Authorization": f"Bearer {access_token}"}
    calendars: list[dict] = []
    page_token = None
    async with httpx.AsyncClient(timeout=45.0) as client:
        while True:
            params = {"pageToken": page_token} if page_token else {}
            resp = await client.get(GOOGLE_CALENDAR_LIST_URL, headers=headers, params=params)
            if resp.status_code >= 400:
                text = resp.text[:300].replace("\n", " ")
                raise RuntimeError(f"Google Calendar list fetch failed ({resp.status_code}): {text}")
            payload = resp.json()
            calendars.extend(payload.get("items", []))
            page_token = payload.get("nextPageToken")
            if not page_token:
                break
    return [c for c in calendars if c.get("primary") or (c.get("selected") and not c.get("hidden"))]


async def _fetch_google_events(
    access_token: str,
    *,
    time_min: datetime,
    time_max: datetime,
    calendar_id: str = "primary",
) -> list[dict]:
    headers = {"Authorization": f"Bearer {access_token}"}
    url = GOOGLE_EVENTS_URL.format(quote(calendar_id, safe=""))
    params = {
        "singleEvents": "true",
        "orderBy": "startTime",
        "showDeleted": "true",
        "maxResults": "2500",
        "timeMin": time_min.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        "timeMax": time_max.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
    }

    all_events: list[dict] = []
    page_token = None
    async with httpx.AsyncClient(timeout=45.0) as client:
        while True:
            req_params = dict(params)
            if page_token:
                req_params["pageToken"] = page_token
            resp = await client.get(url, headers=headers, params=req_params)
            if resp.status_code >= 400:
                text = resp.text[:300].replace("\n", " ")
                raise RuntimeError(f"Google Calendar events fetch failed ({resp.status_code}): {text}")
            payload = resp.json()
            all_events.extend(payload.get("items", []))
            page_token = payload.get("nextPageToken")
            if not page_token:
                break
    return all_events


async def get_google_calendar_status(db: AsyncSession, user_id: int) -> dict:
    result = await db.execute(select(GoogleOAuthToken).where(GoogleOAuthToken.user_id == user_id))
    token_row = result.scalar_one_or_none()
    if not token_row:
        return {"connected": False, "account_linked": False, "calendar_access": False}
    calendar_access = _has_calendar_scope(token_row.scopes)
    return {
        "connected": calendar_access,
        "account_linked": True,
        "calendar_access": calendar_access,
        "google_email": token_row.google_email,
        "last_sync_at": token_row.last_sync_at.isoformat() if token_row.last_sync_at else None,
        "token_expiry": token_row.token_expiry.isoformat() if token_row.token_expiry else None,
        "scopes": token_row.scopes or "",
    }


async def sync_google_calendar(
    db: AsyncSession,
    *,
    user_id: int,
    days_back: int = 7,
    days_ahead: int = 60,
) -> dict:
    token_result = await db.execute(select(GoogleOAuthToken).where(GoogleOAuthToken.user_id == user_id))
    token_row = token_result.scalar_one_or_none()
    if not token_row:
        raise RuntimeError("Google Calendar is not connected for this account.")
    if not _has_calendar_scope(token_row.scopes):
        raise RuntimeError("Google Calendar permission missing. Click Connect Google to grant calendar access.")

    access_token = await _ensure_access_token(db, token_row)
    now = datetime.now(timezone.utc)
    time_min = now - timedelta(days=days_back)
    time_max = now + timedelta(days=days_ahead)

    # Every calendar switched on in Google, not just the main one. The main
    # one keeps the id "primary" so events imported before this still match.
    remote_events: list[tuple[str, dict, dict]] = []
    failed_calendars: set[str] = set()
    for cal in await _fetch_calendars(access_token):
        cal_id = "primary" if cal.get("primary") else cal["id"]
        try:
            events = await _fetch_google_events(access_token, time_min=time_min, time_max=time_max, calendar_id=cal_id)
        except RuntimeError as e:
            # One unreadable calendar must not stop the rest, or hide its events
            logger.warning("Google calendar %s skipped for user %s: %s", cal_id, user_id, e)
            failed_calendars.add(cal_id)
            continue
        remote_events.extend((cal_id, cal, event) for event in events)

    local_result = await db.execute(
        select(ScheduleEvent).where(ScheduleEvent.user_id == user_id)
    )
    local_events = local_result.scalars().all()
    existing_google = {}
    for ev in local_events:
        payload = ev.event_data or {}
        if payload.get("source") == "google_calendar" and payload.get("google_event_id"):
            existing_google[(payload.get("calendar_id") or "primary", payload["google_event_id"])] = ev

    created = 0
    updated = 0
    deactivated = 0
    remote_ids: set[tuple[str, str]] = set()

    for cal_id, cal, event in remote_events:
        google_event_id = event.get("id")
        if not google_event_id:
            continue
        key = (cal_id, google_event_id)
        remote_ids.add(key)
        status = (event.get("status") or "").lower()
        existing = existing_google.get(key)

        if status == "cancelled":
            if existing and existing.is_active:
                existing.is_active = False
                deactivated += 1
            continue

        try:
            day_of_week, specific_date, start_time, end_time = _event_time_fields(event)
        except Exception:
            continue

        summary = (event.get("summary") or "Calendar event").strip() or "Calendar event"
        description = event.get("description")
        location = event.get("location")
        event_type = _event_type_from_summary(summary)
        payload = {
            "source": "google_calendar",
            "google_event_id": google_event_id,
            "calendar_id": cal_id,
            "calendar_name": cal.get("summaryOverride") or cal.get("summary"),
            "color": cal.get("backgroundColor"),   # the calendar's colour in Google
            "status": status,
            "html_link": event.get("htmlLink"),
            "all_day": bool((event.get("start") or {}).get("date")),
        }

        if existing:
            existing.title = summary
            existing.description = description
            existing.event_type = event_type
            existing.day_of_week = day_of_week
            existing.start_time = start_time
            existing.end_time = end_time
            existing.location = location
            existing.specific_date = specific_date
            existing.recurrence = RecurrenceType.ONCE
            existing.event_data = payload
            existing.is_active = True
            updated += 1
        else:
            db.add(
                ScheduleEvent(
                    user_id=user_id,
                    title=summary,
                    description=description,
                    event_type=event_type,
                    day_of_week=day_of_week,
                    start_time=start_time,
                    end_time=end_time,
                    location=location,
                    recurrence=RecurrenceType.ONCE,
                    specific_date=specific_date,
                    event_data=payload,
                    is_user_modified=False,
                    is_active=True,
                )
            )
            created += 1

    # Only events inside the fetched window can be "gone from Google"; older
    # ones were simply not asked for, and used to vanish a day after each sync.
    # The window's first and last days are only partly covered, so skip them.
    # A calendar switched off in Google drops out too; one that failed to load
    # this time keeps its events.
    for key, existing in existing_google.items():
        day = existing.specific_date.date() if existing.specific_date else None
        in_window = day is not None and time_min.date() < day < time_max.date()
        if in_window and key[0] not in failed_calendars and key not in remote_ids and existing.is_active:
            existing.is_active = False
            deactivated += 1

    token_row.last_sync_at = now
    await db.commit()

    return {
        "created": created,
        "updated": updated,
        "deactivated": deactivated,
        "fetched": len(remote_events),
        "range": {
            "from": time_min.isoformat(),
            "to": time_max.isoformat(),
        },
    }


def _sync_due(token_row: GoogleOAuthToken) -> bool:
    last = token_row.last_sync_at
    if last is not None and last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    return _has_calendar_scope(token_row.scopes) and (
        last is None or datetime.now(timezone.utc) - last >= AUTO_SYNC_EVERY
    )


async def scheduler():
    """Every 30 minutes, sync each connected calendar not synced for 3 hours,
    so the schedule (and the AI coach reading it) stays current without a tap."""
    await asyncio.sleep(90)
    while True:
        try:
            async with async_session() as db:
                due = [t.user_id for t in (await db.execute(select(GoogleOAuthToken))).scalars().all() if _sync_due(t)]
            for user_id in due:
                try:
                    async with async_session() as db:
                        await sync_google_calendar(db, user_id=user_id)
                except Exception as e:
                    logger.warning("Google Calendar sync for user %s failed: %s", user_id, e)
        except Exception:
            logger.exception("Google Calendar scheduler")
        await asyncio.sleep(1800)
