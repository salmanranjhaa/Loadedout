"""Google Calendar in the schedule: duplicates of the user's own events, dates
of late-night events, and past events surviving a sync.

Runs the real sync on a temporary SQLite database with Google stubbed out.
Needs aiosqlite (pip install aiosqlite).

Run with pytest, or standalone:  python3 tests/test_google_calendar_sync.py
"""
import asyncio
import os
import sys
import tempfile
from datetime import datetime, time, timedelta, timezone
from types import SimpleNamespace

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

import app.services.google_calendar as gcal  # noqa: E402
from app.api.routes_schedule import _google_duplicates  # noqa: E402
from app.models.google_oauth import GoogleOAuthToken  # noqa: E402
from app.models.schedule import EventType, ScheduleEvent  # noqa: E402
from app.models.user import User  # noqa: E402

DB_FILE = os.path.join(tempfile.mkdtemp(), "google_calendar.db")
engine = create_async_engine(f"sqlite+aiosqlite:///{DB_FILE}", poolclass=NullPool)
Session = async_sessionmaker(engine, expire_on_commit=False)


def ev(id, title, start, end, google=False, all_day=False):
    data = {"source": "google_calendar", "all_day": all_day} if google else {}
    return SimpleNamespace(id=id, title=title, start_time=time.fromisoformat(start),
                           end_time=time.fromisoformat(end), event_data=data)


def test_duplicates():
    own_gym = ev(1, "Gym A - Legs + Back", "18:30", "19:39")
    own_cycling = ev(2, "Indoor Cycling", "19:40", "20:40")
    g_cycling = ev(10, "Indoor Cycling (HSG)", "19:40", "20:40", google=True)      # same thing
    g_call = ev(11, "Team call", "18:45", "19:15", google=True)                    # different thing, same time
    g_crossfit = ev(12, "CrossFit (HSG)", "18:30", "19:30", google=True)           # only the (HSG) tag in common
    g_gym_day = ev(13, "Gym day", "00:00", "23:59", google=True, all_day=True)     # all-day, never hidden
    hidden, marked = _google_duplicates([own_gym, own_cycling, g_cycling, g_call, g_crossfit, g_gym_day])
    assert hidden == {10} and marked == {2}, (hidden, marked)

    # Back-to-back is not overlap
    assert _google_duplicates([own_gym, ev(14, "Gym", "19:39", "20:30", google=True)]) == (set(), set())


def test_late_night_date():
    _, specific, start, _ = gcal._event_time_fields({
        "start": {"dateTime": "2026-11-03T00:30:00+01:00", "timeZone": "Europe/Zurich"},
        "end": {"dateTime": "2026-11-03T01:30:00+01:00", "timeZone": "Europe/Zurich"},
    })
    # Stored as the event's own date at UTC midnight: the schedule filters by
    # the UTC date, where the real instant (23:30 UTC) fell on 2 November
    assert specific == datetime(2026, 11, 3, tzinfo=timezone.utc) and start == time(0, 30), (specific, start)


def test_sync_keeps_past_events():
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    def local(day, gid, cal=None):
        data = {"source": "google_calendar", "google_event_id": gid}   # imported before calendar ids
        if cal:
            data["calendar_id"] = cal
        return ScheduleEvent(user_id=1, title=gid, event_type=EventType.ROUTINE, day_of_week=day.weekday(),
                             start_time=time(9), end_time=time(10), specific_date=day, is_active=True,
                             event_data=data)

    async def setup():
        async with engine.begin() as conn:
            for t in (User.__table__, GoogleOAuthToken.__table__, ScheduleEvent.__table__):
                await conn.run_sync(t.create)
        async with Session() as s:
            s.add(User(id=1, username="me", email="me@example.com", hashed_password="x"))
            s.add(GoogleOAuthToken(user_id=1, google_sub="sub", access_token="at", scopes=gcal.CALENDAR_READONLY_SCOPE))
            s.add_all([
                local(today - timedelta(days=20), "past"),
                local(today + timedelta(days=3), "removed"),
                local(today + timedelta(days=3), "kept", cal="broken"),
            ])
            await s.commit()

    tomorrow = (today + timedelta(days=1)).date().isoformat()
    race = (today + timedelta(days=2)).replace(hour=17).isoformat()
    by_calendar = {
        "primary": [{"id": "new", "summary": "Dentist", "start": {"date": tomorrow}, "end": {"date": tomorrow}}],
        "f1@group": [{"id": "gp", "summary": "Formula 1 race", "start": {"dateTime": race}, "end": {"dateTime": race}}],
    }
    fetched = []

    async def calendars(access_token):
        return [c for c in [
            {"id": "me@gmail.com", "primary": True},
            {"id": "f1@group", "selected": True, "summary": "F1", "backgroundColor": "#ff7537"},
            {"id": "broken", "selected": True},
            {"id": "off@group", "selected": False},
        ] if c.get("primary") or c.get("selected")]

    async def fetch(access_token, *, time_min, time_max, calendar_id):
        fetched.append(calendar_id)
        if calendar_id == "broken":
            raise RuntimeError("Google Calendar events fetch failed (404)")
        return by_calendar[calendar_id]

    async def token(db, row):
        return "at"

    gcal._fetch_calendars, gcal._fetch_google_events, gcal._ensure_access_token = calendars, fetch, token

    async def run():
        async with Session() as db:
            result = await gcal.sync_google_calendar(db, user_id=1)
        async with Session() as db:
            rows = {e.event_data["google_event_id"]: e for e in (await db.execute(select(ScheduleEvent))).scalars()}
        return result, rows

    asyncio.run(setup())
    result, rows = asyncio.run(run())
    assert rows["past"].is_active, "an event older than the sync window must stay"
    assert not rows["removed"].is_active, "an event inside the window that left Google goes"
    assert rows["kept"].is_active, "a calendar that failed to load keeps its events"
    assert rows["new"].event_data["all_day"] and rows["new"].specific_date.date().isoformat() == tomorrow
    # Other switched-on calendars come in with their colour; switched-off ones aren't read
    assert rows["gp"].event_data["calendar_id"] == "f1@group" and rows["gp"].event_data["color"] == "#ff7537"
    assert sorted(fetched) == ["broken", "f1@group", "primary"], fetched
    assert result["created"] == 2 and result["deactivated"] == 1, result


if __name__ == "__main__":
    test_duplicates()
    test_late_night_date()
    test_sync_keeps_past_events()
    print("ok")
