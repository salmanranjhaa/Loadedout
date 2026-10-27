"""Garmin Connect personal API: each user's key, and syncing their activities
(with route, splits and heart rate zones) and daily health into Loaded Out.

One sync is used three ways: the Sync button, Claude (through the internal
endpoints the MCP server calls) and the schedule that runs inside the backend.
Every query is for one user_id, and a key is only ever used for its own user.
"""
import asyncio
import base64
import hashlib
import io
import logging
import math
import time
import zipfile
from datetime import date, datetime, timedelta, timezone

import httpx
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import select, text

from app.core.config import get_settings
from app.core.database import async_session
from app.models.analytics import WorkoutLog
from app.models.garmin import DEFAULT_GARMIN_SETTINGS, GarminConnection, HealthDay, WorkoutTrack
from app.services.workout_links import auto_link

logger = logging.getLogger(__name__)
settings = get_settings()

BASE = "https://personal.connectapi.garmin.com"
TOKEN_PATH = "/personalapitoken-service/personal-api/personal-api-key/token"
SEMICIRCLE = 180 / 2 ** 31
HEALTH_DAYS_FIRST_SYNC = 30


class GarminError(Exception):
    def __init__(self, message: str, key_problem: bool = False):
        super().__init__(message)
        self.key_problem = key_problem


# ---- keys ----

def _fernet() -> Fernet:
    # ponytail: derived from SECRET_KEY; rotating it means saved Garmin keys have to be entered again
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(b"garmin-key:" + settings.SECRET_KEY.encode()).digest()))


def encrypt_key(key: str) -> str:
    return _fernet().encrypt(key.encode()).decode()


def _decrypt_key(stored: str):
    try:
        return _fernet().decrypt(stored.encode()).decode()
    except InvalidToken:
        return None


def settings_of(conn) -> dict:
    return {**DEFAULT_GARMIN_SETTINGS, **((conn.settings or {}) if conn else {})}


def key_for(conn, user_id: int) -> tuple:
    """The key to sync this user with and where it comes from: the one they
    saved, or the server's key when that key belongs to them."""
    if conn is not None and not settings_of(conn)["enabled"]:
        return None, None
    if conn is not None and conn.api_key_encrypted:
        key = _decrypt_key(conn.api_key_encrypted)
        if key:
            return key, "saved"
    if settings.GARMIN_API_KEY and settings.GARMIN_API_KEY_USER_ID and user_id == settings.GARMIN_API_KEY_USER_ID:
        return settings.GARMIN_API_KEY, "server"
    return None, None


async def get_connection(db, user_id: int, create: bool = False):
    conn = (await db.execute(select(GarminConnection).where(GarminConnection.user_id == user_id))).scalar_one_or_none()
    if conn is None and create:
        conn = GarminConnection(user_id=user_id, settings=dict(DEFAULT_GARMIN_SETTINGS), status="new")
        db.add(conn)
        await db.flush()
    return conn


# ---- the API ----

class Garmin:
    """Calls for one key. Access tokens last 24 hours, so they are reused."""
    _tokens: dict = {}

    def __init__(self, key: str, client: httpx.AsyncClient):
        self.key, self.client = key, client
        self.key_id = hashlib.sha256(key.encode()).hexdigest()

    async def token(self) -> str:
        token, until = self._tokens.get(self.key_id, (None, 0))
        if token and until > time.time():
            return token
        r = await self.client.post(BASE + TOKEN_PATH, headers={"Authorization": f"ApiKey {self.key}"})
        if r.status_code in (400, 401, 403, 404):
            raise GarminError("Garmin did not accept the key. It may have expired or been deleted: "
                              "create a new one on the Garmin Connect website and save it in the app (Profile → Full settings → Garmin).", key_problem=True)
        if r.status_code >= 400:
            raise GarminError(f"Garmin is not answering right now ({r.status_code}). Try again later.")
        token = r.text.strip()
        self._tokens[self.key_id] = (token, time.time() + 23 * 3600)
        return token

    async def get(self, path: str, raw: bool = False, **params):
        for attempt in range(3):
            r = await self.client.get(BASE + path, params=params or None,
                                      headers={"Authorization": f"Bearer {await self.token()}"})
            if r.status_code == 401 and attempt == 0:
                self._tokens.pop(self.key_id, None)          # token expired early: get a new one
                continue
            if r.status_code in (429, 500, 502, 503, 504) and attempt < 2:
                await asyncio.sleep(2 * (attempt + 1))
                continue
            break
        if r.status_code == 204:
            return None
        if r.status_code >= 400:
            raise GarminError(f"Garmin refused {path.split('/')[1]} ({r.status_code}).")
        return r.content if raw else r.json()

    async def activities(self, since):
        """Newest first, back to `since` (a date) or to the very first one."""
        start = 0
        while True:
            page = await self.get("/activitylist-service/activities/search/activities", start=start, limit=50)
            if not page:
                return
            for a in page:
                if since and a.get("startTimeLocal", "")[:10] < since.isoformat():
                    return
                yield a
            start += len(page)

    async def zone_floors(self) -> list:
        """Lower heart rate of zones 1-5 (Garmin's own zones for this user)."""
        try:
            zones = await self.get("/biometric-service/heartRateZones/v2") or []
        except GarminError:
            return []
        z = next((z for z in zones if z.get("sport") == "DEFAULT"), zones[0] if zones else {})
        floors = [z.get(f"zone{i}Floor") for i in range(1, 6)]
        return floors if all(isinstance(f, (int, float)) for f in floors) else []


# ---- activities ----

TYPES = {
    "running": ("running", None), "trail_running": ("running", "trail"), "treadmill_running": ("running", "treadmill"),
    "track_running": ("running", "track"), "indoor_running": ("running", "indoor"), "street_running": ("running", "road"),
    "walking": ("walking", None), "hiking": ("walking", "hike"), "casual_walking": ("walking", None),
    "speed_walking": ("walking", "speed"),
    "cycling": ("cycling", None), "road_biking": ("cycling", "road"), "mountain_biking": ("cycling", "mtb"),
    "indoor_cycling": ("cycling", "indoor"), "virtual_ride": ("cycling", "virtual"), "gravel_cycling": ("cycling", "gravel"),
    "lap_swimming": ("swimming", "pool"), "open_water_swimming": ("swimming", "open_water"),
    "strength_training": ("strength", None), "hiit": ("hiit", None), "indoor_cardio": ("cardio", None),
    "yoga": ("yoga", None), "pilates": ("pilates", None), "boxing": ("boxing", None),
}
FOOT = {"running", "walking"}


def workout_type_of(activity: dict) -> tuple:
    key = (activity.get("activityType") or {}).get("typeKey") or "other"
    return TYPES.get(key, ("other", key))


def _r(v):
    return round(v) if isinstance(v, (int, float)) else None


def _thin(points: list, most: int) -> list:
    # ponytail: every n-th point, not a shape-aware simplification; fine at a few hundred points
    if len(points) <= most:
        return points
    step = math.ceil(len(points) / most)
    return points[::step] + ([points[-1]] if (len(points) - 1) % step else [])


def parse_fit(data: bytes, foot: bool, zone_floors: list) -> dict:
    """Route, streams along the route, per-km splits and time in heart rate
    zones from an activity file (a .fit, or the zip Garmin wraps it in)."""
    import fitdecode

    if data[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            name = next((n for n in z.namelist() if n.lower().endswith(".fit")), None)
            if not name:
                return {}
            data = z.read(name)
    recs = []
    with fitdecode.FitReader(io.BytesIO(data), error_handling=fitdecode.ErrorHandling.WARN) as fit:
        for frame in fit:
            if isinstance(frame, fitdecode.FitDataMessage) and frame.name == "record":
                v = lambda n: frame.get_value(n, fallback=None)  # noqa: E731
                recs.append({
                    "t": v("timestamp"), "lat": v("position_lat"), "lon": v("position_long"), "d": v("distance"),
                    "spd": v("enhanced_speed") or v("speed"), "alt": v("enhanced_altitude") or v("altitude"),
                    "hr": v("heart_rate"), "cad": v("cadence"), "pw": v("power"),
                })
    if not recs:
        return {}
    out = {}

    route = [[round(r["lat"] * SEMICIRCLE, 6), round(r["lon"] * SEMICIRCLE, 6)]
             for r in recs if r["lat"] is not None and r["lon"] is not None]
    if len(route) > 1:
        out["route"], out["preview"] = _thin(route, 400), _thin(route, 40)

    along = [r for r in recs if r["d"] is not None]
    if along:
        pts = _thin(along, 250)
        streams = {
            "distance_km": [round(r["d"] / 1000, 3) for r in pts],
            "hr": [r["hr"] for r in pts],
            "elevation_m": [round(r["alt"], 1) if r["alt"] is not None else None for r in pts],
            "cadence": [(r["cad"] * 2 if foot else r["cad"]) if r["cad"] is not None else None for r in pts],
            "power_w": [r["pw"] for r in pts],
        }
        if foot:
            streams["pace_s_per_km"] = [min(round(1000 / r["spd"]), 1800) if r["spd"] and r["spd"] > 0.3 else None for r in pts]
        else:
            streams["speed_kmh"] = [round(r["spd"] * 3.6, 1) if r["spd"] is not None else None for r in pts]
        out["streams"] = {k: v for k, v in streams.items() if any(x is not None for x in v)}

        # Per-km splits, with the last part-km as its own split
        splits, mark, km = [], along[0], 1
        for i, r in enumerate(along):
            last = i == len(along) - 1
            if r["d"] >= km * 1000 or (last and r["d"] - mark["d"] > 50):
                seg = [x for x in along if mark["d"] <= x["d"] <= r["d"]]
                secs = (r["t"] - mark["t"]).total_seconds() if r["t"] and mark["t"] else None
                length = (r["d"] - mark["d"]) / 1000
                hrs = [x["hr"] for x in seg if x["hr"]]
                alts = [x["alt"] for x in (mark, r) if x["alt"] is not None]
                splits.append({k: v for k, v in {
                    "km": km if r["d"] >= km * 1000 else round(length, 2),
                    "time_s": _r(secs),
                    "pace_s_per_km": _r(secs / length) if secs and length > 0 else None,
                    "elev_delta_m": _r(alts[1] - alts[0]) if len(alts) == 2 else None,
                    "avg_hr": _r(sum(hrs) / len(hrs)) if hrs else None,
                }.items() if v is not None})
                mark, km = r, km + 1
        if splits and foot:
            out["splits"] = splits

    if zone_floors:
        zones = {}
        for a, b in zip(recs, recs[1:]):
            if a["hr"] and a["t"] and b["t"]:
                n = sum(1 for f in zone_floors if a["hr"] >= f)
                if n:
                    zones[f"z{n}"] = zones.get(f"z{n}", 0) + min((b["t"] - a["t"]).total_seconds(), 15)
        if zones:
            out["hr_zone_seconds"] = {z: round(s) for z, s in sorted(zones.items())}
    return out


def activity_details(a: dict, wtype: str, subtype, parsed: dict) -> dict:
    foot = wtype in FOOT
    spd = a.get("averageSpeed")
    full_km = [s["pace_s_per_km"] for s in parsed.get("splits") or [] if isinstance(s.get("km"), int) and s.get("pace_s_per_km")]
    d = {
        "name": a.get("activityName"),
        "start_time": (a.get("startTimeLocal") or "")[11:16] or None,
        "subtype": subtype,
        "distance_km": round(a["distance"] / 1000, 2) if a.get("distance") else None,
        "moving_time_s": _r(a.get("movingDuration")),
        "elapsed_time_s": _r(a.get("elapsedDuration")),
        "avg_pace_s_per_km": _r(1000 / spd) if foot and spd else None,
        "best_split_s_per_km": min(full_km) if full_km else None,
        "avg_speed_kmh": round(spd * 3.6, 1) if spd and not foot else None,
        "elevation_gain_m": _r(a.get("elevationGain")),
        "elevation_loss_m": _r(a.get("elevationLoss")),
        "min_elevation_m": _r(a.get("minElevation")),
        "max_elevation_m": _r(a.get("maxElevation")),
        "avg_hr": _r(a.get("averageHR")),
        "max_hr": _r(a.get("maxHR")),
        "avg_cadence_spm": _r(a.get("averageRunningCadenceInStepsPerMinute")),
        "max_cadence_spm": _r(a.get("maxRunningCadenceInStepsPerMinute")),
        "avg_power_w": _r(a.get("avgPower")),
        "max_power_w": _r(a.get("maxPower")),
        "normalized_power_w": _r(a.get("normPower")),
        "steps": a.get("steps"),
        "splits": parsed.get("splits"),
        "hr_zone_seconds": parsed.get("hr_zone_seconds"),
        "source": ["garmin"],
        "garmin_activity_type": (a.get("activityType") or {}).get("typeKey"),
    }
    return {k: v for k, v in d.items() if v not in (None, [], {}, "")}


async def import_activity(db, g: Garmin, user_id: int, a: dict, zone_floors: list) -> tuple:
    """Add one Garmin activity as a workout (with its route), then link it to
    the logged workout of the same session if there is one. Returns (added, linked)."""
    aid = int(a["activityId"])
    seen = (await db.execute(select(WorkoutLog.id).where(
        WorkoutLog.user_id == user_id, WorkoutLog.garmin_activity_id == aid))).scalar_one_or_none()
    if seen is not None:
        return False, False
    wtype, subtype = workout_type_of(a)
    parsed = {}
    try:
        fit = await g.get(f"/download-service/files/activity/{aid}", raw=True)
        if fit:
            parsed = parse_fit(fit, wtype in FOOT, zone_floors)
    except Exception as e:                    # a broken file must not stop the sync
        logger.warning("Garmin activity %s: could not read its file: %s", aid, e)
    w = WorkoutLog(
        user_id=user_id,
        date=date.fromisoformat(a["startTimeLocal"][:10]),
        workout_type=wtype,
        duration_minutes=max(1, round((a.get("duration") or a.get("elapsedDuration") or 60) / 60)),
        calories_burned_est=_r(a.get("calories")),
        details=activity_details(a, wtype, subtype, parsed),
        garmin_activity_id=aid,
    )
    db.add(w)
    await db.flush()
    if parsed.get("route") or parsed.get("streams"):
        db.add(WorkoutTrack(user_id=user_id, workout_log_id=w.id, route=parsed.get("route"),
                            preview=parsed.get("preview"), streams=parsed.get("streams")))
        await db.flush()
    _, linked = await auto_link(db, w)
    return True, linked


# ---- daily health ----

def _minute_of_day(ts_ms, day_start_gmt: str):
    start = datetime.fromisoformat(day_start_gmt.split(".")[0]).replace(tzinfo=timezone.utc)
    return int((ts_ms / 1000 - start.timestamp()) // 60)


def _clock(ms):
    # Garmin's "local" timestamps are local wall time written as if it were UTC
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%H:%M") if ms else None


async def sync_health(db, g: Garmin, user_id: int, start: date, end: date, opts: dict) -> int:
    days: dict = {}

    def day(d):
        return days.setdefault(date.fromisoformat(str(d)[:10]), {"data": {}})

    weeks = []
    s = start
    while s <= end:                           # Garmin refuses longer ranges for these
        weeks.append((s, min(s + timedelta(days=6), end)))
        s += timedelta(days=7)

    if opts["health"]:
        for s, e in weeks:
            for row in await g.get(f"/usersummary-service/stats/steps/daily/{s}/{e}") or []:
                x = day(row["calendarDate"])
                x["steps"], x["step_goal"] = row.get("totalSteps"), row.get("stepGoal")
            for row in await g.get(f"/usersummary-service/stats/stress/daily/{s}/{e}") or []:
                level = (row.get("values") or {}).get("overallStressLevel")
                if isinstance(level, int) and level >= 0:
                    day(row["calendarDate"])["stress_avg"] = level
            for row in await g.get("/wellness-service/wellness/bodyBattery/reports/daily", startDate=s, endDate=e) or []:
                values = [v for v in row.get("bodyBatteryValuesArray") or [] if isinstance(v, list) and len(v) >= 2 and v[-1] is not None]
                if values:
                    levels = [v[-1] for v in values]
                    day(row["date"])["data"]["body_battery"] = {
                        "charged": row.get("charged"), "drained": row.get("drained"),
                        "high": max(levels), "low": min(levels),
                        "samples": [[_minute_of_day(v[0], row["startTimestampGMT"]), v[-1]] for v in values],
                    }
        d = start
        while d <= end:
            hr = await g.get("/wellness-service/wellness/dailyHeartRate", date=d) or {}
            samples = [[_minute_of_day(t, hr["startTimestampGMT"]), b] for t, b in hr.get("heartRateValues") or [] if b]
            if samples or hr.get("restingHeartRate"):
                x = day(d)
                x["resting_hr"] = hr.get("restingHeartRate")
                x["data"]["heart_rate"] = {"resting": hr.get("restingHeartRate"), "min": hr.get("minHeartRate"),
                                           "max": hr.get("maxHeartRate"), "resting_7d": hr.get("lastSevenDaysAvgRestingHeartRate"),
                                           "samples": samples}
            summary = await g.get("/usersummary-service/usersummary/daily", calendarDate=d) or {}
            # A day the watch was not worn still has a resting-calorie summary: skip it
            if summary.get("totalSteps") or summary.get("activeKilocalories"):
                day(d)["data"]["summary"] = {k: summary.get(k) for k in (
                    "activeKilocalories", "totalKilocalories", "moderateIntensityMinutes", "vigorousIntensityMinutes",
                    "totalDistanceMeters", "floorsAscended", "highlyActiveSeconds", "activeSeconds", "sedentarySeconds")
                    if summary.get(k) is not None}
            d += timedelta(days=1)

    if opts["sleep"]:
        d = start
        while d <= end:
            sl = await g.get("/sleep-service/sleep/dailySleep", date=d) or {}
            if sl.get("sleepTimeSeconds"):
                x = day(d)
                x["sleep_seconds"] = sl["sleepTimeSeconds"]
                x["data"]["sleep"] = {"seconds": sl["sleepTimeSeconds"], "deep_s": sl.get("deepSleepSeconds"),
                                      "light_s": sl.get("lightSleepSeconds"), "rem_s": sl.get("remSleepSeconds"),
                                      "awake_s": sl.get("awakeSleepSeconds"),
                                      "start": _clock(sl.get("sleepStartTimestampLocal")),
                                      "end": _clock(sl.get("sleepEndTimestampLocal"))}
            d += timedelta(days=1)

    saved = 0
    for d, x in days.items():
        fields = {k: x.get(k) for k in ("steps", "step_goal", "resting_hr", "sleep_seconds", "stress_avg")}
        if not any(v is not None for v in fields.values()) and not x["data"]:
            continue
        row = (await db.execute(select(HealthDay).where(HealthDay.user_id == user_id, HealthDay.date == d))).scalar_one_or_none()
        if row is None:
            row = HealthDay(user_id=user_id, date=d, data={})
            db.add(row)
        for k, v in fields.items():
            if v is not None:
                setattr(row, k, v)
        row.data = {**(row.data or {}), **x["data"]}
        saved += 1
    await db.flush()
    return saved


# ---- one sync ----

async def sync_user(db, user_id: int, full: bool = False) -> dict:
    """Bring this user's Garmin data in. The first sync takes the whole activity
    history (when allowed) and the last 30 days of health; later ones only
    what is new."""
    conn = await get_connection(db, user_id, create=True)
    key, _ = key_for(conn, user_id)
    if not key:
        raise GarminError("No Garmin key: add yours in the app under Profile → Full settings → Garmin.", key_problem=True)
    opts = settings_of(conn)
    last = conn.last_sync_at
    first = last is None
    started = datetime.now(timezone.utc)
    today = date.today()
    result = {"activities_added": 0, "linked": 0, "health_days": 0}
    try:
        async with httpx.AsyncClient(timeout=45) as client:
            g = Garmin(key, client)
            if opts["activities"]:
                since = None if (first or full) and opts["full_history"] else \
                    (today - timedelta(days=30) if first or full else last.date() - timedelta(days=2))
                floors = await g.zone_floors()
                async for a in g.activities(since):
                    added, linked = await import_activity(db, g, user_id, a, floors)
                    await db.commit()          # an error later keeps what came in so far
                    result["activities_added"] += added
                    result["linked"] += linked
            if opts["health"] or opts["sleep"]:
                back = HEALTH_DAYS_FIRST_SYNC if first or full else (today - last.date()).days + 1
                result["health_days"] = await sync_health(db, g, user_id, today - timedelta(days=max(back, 2) - 1), today, opts)
    except (GarminError, httpx.HTTPError) as e:
        await db.rollback()
        conn = await get_connection(db, user_id, create=True)
        key_problem = getattr(e, "key_problem", False)
        conn.status = "key_error" if key_problem else "error"
        conn.last_error = str(e) if isinstance(e, GarminError) else "Could not reach Garmin. Try again later."
        await db.commit()
        if isinstance(e, GarminError):
            raise
        raise GarminError(conn.last_error) from e
    conn.status, conn.last_sync_at, conn.last_result, conn.last_error = "ok", started, result, None
    await db.commit()
    return result


# ---- running syncs in the background ----

_running: dict = {}


def is_syncing(user_id: int) -> bool:
    task = _running.get(user_id)
    return task is not None and not task.done()


async def _sync_in_own_session(user_id: int, full: bool) -> dict:
    # The sync commits as it goes, so the row-level security user is set for the
    # whole connection and cleared before it goes back to the pool.
    async with async_session() as db:
        await db.execute(text(f"SET app.current_user_id = {int(user_id)}"))
        try:
            return await sync_user(db, user_id, full)
        finally:
            await db.rollback()
            await db.execute(text("RESET app.current_user_id"))
            await db.commit()


def start_sync(user_id: int, full: bool = False) -> asyncio.Task:
    """Start a sync for this user, or return the one already running."""
    if not is_syncing(user_id):
        _running[user_id] = asyncio.create_task(_sync_in_own_session(user_id, full))
    return _running[user_id]


async def sync_and_wait(user_id: int, full: bool = False, wait_seconds: float = 50) -> dict:
    """Sync and return the result, or say it is still running if it takes long
    (the first sync of a long history can take a few minutes)."""
    task = start_sync(user_id, full)
    try:
        return {"status": "done", **await asyncio.wait_for(asyncio.shield(task), wait_seconds)}
    except asyncio.TimeoutError:
        return {"status": "still_syncing"}


def _due(conn) -> bool:
    opts = settings_of(conn)
    hours = opts.get("auto_sync_hours") or 0
    return (hours > 0 and conn.status != "key_error" and key_for(conn, conn.user_id)[0] is not None
            and (conn.last_sync_at is None or datetime.now(timezone.utc) - conn.last_sync_at >= timedelta(hours=hours)))


async def scheduler():
    """Every 10 minutes, sync each user whose automatic sync is due."""
    await asyncio.sleep(60)
    while True:
        try:
            async with async_session() as db:
                if settings.GARMIN_API_KEY and settings.GARMIN_API_KEY_USER_ID:
                    await get_connection(db, settings.GARMIN_API_KEY_USER_ID, create=True)
                    await db.commit()
                due = [c.user_id for c in (await db.execute(select(GarminConnection))).scalars().all() if _due(c)]
            for user_id in due:
                try:
                    await start_sync(user_id)
                except Exception as e:
                    logger.warning("Garmin sync for user %s failed: %s", user_id, e)
        except Exception:
            logger.exception("Garmin scheduler")
        await asyncio.sleep(600)
