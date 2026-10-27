"""Garmin sync and one-session-one-workout linking.

- A Garmin activity and a workout logged by hand / through Claude for the same
  session become one workout: Garmin's measurements, the logged name, notes and
  parts, the logged id. Unlinking splits them and keeps them apart.
- Unclear matches are suggested, not linked. Other people's workouts never match.
- A sync (against a fake Garmin) imports activities with their route and daily
  health, and the server key only ever works for the user it belongs to.

Runs on a temporary SQLite database with the login faked. Needs aiosqlite.
Run with pytest, or standalone:  python3 tests/test_garmin_sync.py
"""
import asyncio
import os
import sys
import tempfile
from datetime import date, datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

from app.api import routes_garmin, routes_workout  # noqa: E402
from app.core.auth import get_current_user  # noqa: E402
from app.core.database import get_db  # noqa: E402
from app.core.limiter import limiter  # noqa: E402
from app.models.analytics import WorkoutLog  # noqa: E402
from app.models.fitness import WorkoutSet  # noqa: E402
from app.models.garmin import GarminConnection, HealthDay, WorkoutTrack  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services import garmin  # noqa: E402
from app.services.workout_links import auto_link, unlink  # noqa: E402

TODAY = date.today()
MIDNIGHT_MS = int(datetime(TODAY.year, TODAY.month, TODAY.day, tzinfo=timezone.utc).timestamp() * 1000)


def make_db():
    engine = create_async_engine(f"sqlite+aiosqlite:///{tempfile.mkdtemp()}/g.db", poolclass=NullPool)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async def setup():
        async with engine.begin() as conn:
            for t in (User.__table__, WorkoutLog.__table__, WorkoutSet.__table__, WorkoutTrack.__table__,
                      GarminConnection.__table__, HealthDay.__table__):
                await conn.run_sync(t.create)
        async with Session() as s:
            s.add_all([User(id=1, username="me", email="me@test.invalid", hashed_password="x"),
                       User(id=2, username="other", email="other@test.invalid", hashed_password="x")])
            await s.commit()
    asyncio.run(setup())
    return Session


def run(Session, fn):
    async def go():
        async with Session() as s:
            out = await fn(s)
            await s.commit()
            return out
    return asyncio.run(go())


def garmin_run(start="10:38", **extra):
    return WorkoutLog(user_id=1, date=TODAY, workout_type="running", duration_minutes=24, calories_burned_est=280,
                      garmin_activity_id=111, details={"name": "Morning Run", "start_time": start, "distance_km": 2.8,
                                                       "avg_hr": 159, "source": ["garmin"], **extra})


def test_link_merge_unlink_and_keep_apart():
    Session = make_db()

    async def step(s):
        logged = WorkoutLog(user_id=1, date=TODAY, workout_type="running", duration_minutes=30, intensity="intense",
                            notes="hills felt hard", details={"name": "Trail Run", "start_time": "10:36", "distance_km": 3.0,
                                                              "parts": [{"name": "Hill repeats"}]})
        s.add(logged)
        await s.flush()
        s.add(WorkoutSet(user_id=1, workout_log_id=logged.id, exercise_name="x", set_number=1))
        g = garmin_run()
        s.add(g)
        await s.flush()
        s.add(WorkoutTrack(user_id=1, workout_log_id=g.id, route=[[47.4, 9.3], [47.41, 9.31]]))
        await s.flush()
        kept, linked = await auto_link(s, g)
        assert linked and kept.id == logged.id, (linked, kept.id)                  # the logged id stays
        d = kept.details
        assert (d["name"], d["distance_km"], d["avg_hr"], d["parts"]) == ("Trail Run", 2.8, 159, [{"name": "Hill repeats"}]), d
        assert set(d["source"]) == {"garmin", "logged"} and kept.garmin_activity_id == 111
        assert (kept.duration_minutes, kept.intensity, kept.notes) == (24, "intense", "hills felt hard")
        rows = (await s.execute(select(WorkoutLog).where(WorkoutLog.user_id == 1))).scalars().all()
        assert len(rows) == 1                                                       # counted once
        track = (await s.execute(select(WorkoutTrack))).scalar_one()
        assert track.workout_log_id == logged.id

        a, b = await unlink(s, kept)
        assert a.details["distance_km"] == 3.0 and a.garmin_activity_id is None and a.duration_minutes == 30
        assert b.garmin_activity_id == 111 and b.details["distance_km"] == 2.8
        assert (await s.execute(select(WorkoutTrack))).scalar_one().workout_log_id == b.id
        assert (await s.execute(select(WorkoutSet))).scalar_one().workout_log_id == a.id
        assert (await auto_link(s, b))[1] is False                                  # split stays split
    run(Session, step)


def test_unclear_matches_are_suggested_and_other_users_never_match():
    Session = make_db()

    async def step(s):
        r1 = WorkoutLog(user_id=1, date=TODAY, workout_type="running", duration_minutes=20, details={"start_time": "10:30"})
        r2 = WorkoutLog(user_id=1, date=TODAY, workout_type="running", duration_minutes=20, details={"start_time": "10:45"})
        theirs = WorkoutLog(user_id=2, date=TODAY, workout_type="running", duration_minutes=24, details={"start_time": "10:38"})
        ride = WorkoutLog(user_id=1, date=TODAY, workout_type="cycling", duration_minutes=24, details={"start_time": "10:38"})
        s.add_all([r1, r2, theirs, ride])
        g = garmin_run()
        s.add(g)
        await s.flush()
        kept, linked = await auto_link(s, g)
        assert not linked and sorted(kept.details["link_suggestions"]) == sorted([r1.id, r2.id]), kept.details
    run(Session, step)


def test_class_without_start_time_links_by_duration():
    Session = make_db()

    async def step(s):
        wod = WorkoutLog(user_id=1, date=TODAY, workout_type="crossfit", duration_minutes=60,
                         details={"parts": [{"name": "WOD", "score": {"type": "rounds_reps", "rounds": 5, "reps": 7}}]})
        s.add(wod)
        watch = WorkoutLog(user_id=1, date=TODAY, workout_type="hiit", duration_minutes=55, garmin_activity_id=222,
                           details={"start_time": "18:02", "avg_hr": 151, "source": ["garmin"]})
        s.add(watch)
        await s.flush()
        kept, linked = await auto_link(s, wod)                                     # logged after Garmin
        assert linked and kept.id == wod.id and kept.workout_type == "crossfit" and kept.details["avg_hr"] == 151
        assert kept.details["parts"][0]["score"]["rounds"] == 5
    run(Session, step)


class FakeGarmin:
    """Stands in for the personal API: one run and a day of health."""
    def __init__(self, key, client):
        assert key == "server-key"

    async def zone_floors(self):
        return [100, 120, 140, 155, 170]

    async def activities(self, since):
        yield {"activityId": 111, "activityName": "St. Gallen Running", "startTimeLocal": f"{TODAY} 10:38:02",
               "activityType": {"typeKey": "trail_running"}, "distance": 2803.0, "duration": 1447.0,
               "movingDuration": 1440.0, "elapsedDuration": 1480.0, "averageSpeed": 1.94, "averageHR": 159.0,
               "maxHR": 175.0, "elevationGain": 84.0, "calories": 280.0}

    async def get(self, path, raw=False, **params):
        if raw:
            return b"fit"
        if "steps" in path:
            return [{"calendarDate": str(TODAY), "totalSteps": 6412, "stepGoal": 10000}]
        if "dailyHeartRate" in path and params["date"] == TODAY:
            return {"restingHeartRate": 54, "minHeartRate": 48, "maxHeartRate": 175,
                    "startTimestampGMT": f"{TODAY}T00:00:00.0", "heartRateValues": [[MIDNIGHT_MS, None], [MIDNIGHT_MS + 120000, 60]]}
        if "dailySleep" in path and params["date"] == TODAY:
            return {"sleepTimeSeconds": 25920, "deepSleepSeconds": 4680}
        return None


def test_sync_imports_runs_and_health_with_the_owners_key_only(monkeypatch=None):
    Session = make_db()
    saved = (garmin.settings.GARMIN_API_KEY, garmin.settings.GARMIN_API_KEY_USER_ID, garmin.Garmin, garmin.parse_fit)
    garmin.settings.GARMIN_API_KEY, garmin.settings.GARMIN_API_KEY_USER_ID = "server-key", 1
    garmin.Garmin = FakeGarmin
    garmin.parse_fit = lambda data, foot, floors: {"route": [[47.4, 9.3], [47.41, 9.31]], "preview": [[47.4, 9.3]],
                                                   "splits": [{"km": 1, "pace_s_per_km": 503}]}
    try:
        async def logged_first(s):
            s.add(WorkoutLog(user_id=1, date=TODAY, workout_type="running", duration_minutes=25,
                             details={"name": "Morning Trail Run", "start_time": "10:36"}))
        run(Session, logged_first)

        result = run(Session, lambda s: garmin.sync_user(s, 1))
        assert result == {"activities_added": 1, "linked": 1, "health_days": 1}, result

        async def check(s):
            w = (await s.execute(select(WorkoutLog))).scalar_one()
            assert (w.details["name"], w.details["distance_km"], w.details["subtype"]) == ("Morning Trail Run", 2.8, "trail")
            assert w.details["avg_pace_s_per_km"] == 515 and w.details["best_split_s_per_km"] == 503
            assert (await s.execute(select(WorkoutTrack))).scalar_one().workout_log_id == w.id
            day = (await s.execute(select(HealthDay))).scalar_one()
            assert (day.steps, day.resting_hr, day.sleep_seconds) == (6412, 54, 25920)
            assert day.data["heart_rate"]["samples"] == [[2, 60]]
            conn = (await s.execute(select(GarminConnection))).scalar_one()
            assert conn.status == "ok" and conn.last_result == result
        run(Session, check)

        again = run(Session, lambda s: garmin.sync_user(s, 1))                      # nothing twice
        assert again["activities_added"] == 0, again

        try:
            run(Session, lambda s: garmin.sync_user(s, 2))                          # not the key's owner
            raise AssertionError("user 2 synced with user 1's key")
        except garmin.GarminError as e:
            assert e.key_problem
    finally:
        garmin.settings.GARMIN_API_KEY, garmin.settings.GARMIN_API_KEY_USER_ID, garmin.Garmin, garmin.parse_fit = saved


def test_api_status_never_returns_the_key_and_app_logging_links():
    Session = make_db()

    async def db():
        async with Session() as s:
            yield s

    app = FastAPI()
    app.state.limiter = limiter
    app.include_router(routes_workout.router, prefix="/api/v1")
    app.include_router(routes_garmin.router, prefix="/api/v1")
    app.dependency_overrides[get_db] = db
    app.dependency_overrides[get_current_user] = lambda: {"sub": 1}
    routes_workout.schedule_workout_embedding = lambda *_: None
    c = TestClient(app)

    async def saved_key(s):
        s.add(GarminConnection(user_id=1, api_key_encrypted=garmin.encrypt_key("my-secret-key-123"), status="ok"))
        s.add(garmin_run(start="07:05"))
    run(Session, saved_key)
    status = c.get("/api/v1/garmin").json()
    assert status["connected"] and status["key_source"] == "saved" and "my-secret-key-123" not in str(status), status

    # Logging the same morning run in the app joins the Garmin one
    r = c.post("/api/v1/workout/", json={"workout_type": "running", "duration_minutes": 25, "date": str(TODAY),
                                         "details": {"name": "Easy run", "start_time": "07:00"}}).json()
    assert r["linked"], r
    listed = c.get("/api/v1/workout/").json()["workouts"]
    assert len(listed) == 1 and listed[0]["linked"] and listed[0]["details"]["distance_km"] == 2.8, listed
    ids = c.post(f"/api/v1/workout/{r['id']}/unlink").json()["ids"]
    assert len(c.get("/api/v1/workout/").json()["workouts"]) == 2
    assert c.post(f"/api/v1/workout/{ids[0]}/link", json={"other_id": ids[1]}).json()["id"] == r["id"]
    assert c.post("/api/v1/internal/garmin/sync", json={"user_id": 1}).status_code == 403   # no internal token


if __name__ == "__main__":
    test_link_merge_unlink_and_keep_apart()
    test_unclear_matches_are_suggested_and_other_users_never_match()
    test_class_without_start_time_links_by_duration()
    test_sync_imports_runs_and_health_with_the_owners_key_only()
    test_api_status_never_returns_the_key_and_app_logging_links()
    print("ok")
