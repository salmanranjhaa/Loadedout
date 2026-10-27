"""One session, one workout.

A Garmin activity and a workout logged in the app or through Claude are often
the same session. Linking folds them into one workout_logs row so nothing is
counted twice:

- the logged workout is the one kept (its id stays, so Claude's references hold),
- Garmin's measurements win (distance, pace, heart rate, splits, route…),
- what was typed wins for everything else (name, type, notes, parts, effort).

Both rows as they were go into link_backup, so unlink can split them again.
"""
from datetime import date as date_cls

from sqlalchemy import select, update

from app.models.analytics import WorkoutLog
from app.models.fitness import WorkoutSet
from app.models.garmin import WorkoutTrack

MATCH_MINUTES = 20
# Keys a Garmin activity measured: on a link they replace what was typed
MEASURED = {
    "start_time", "distance_km", "moving_time_s", "elapsed_time_s", "avg_pace_s_per_km", "best_split_s_per_km",
    "avg_speed_kmh", "elevation_gain_m", "elevation_loss_m", "min_elevation_m", "max_elevation_m",
    "avg_hr", "max_hr", "hr_zone_seconds", "avg_cadence_spm", "max_cadence_spm", "avg_power_w", "max_power_w",
    "normalized_power_w", "steps", "splits", "garmin_activity_type",
}
# Workout types that can be the same session (a CrossFit class may be "hiit" on the watch)
SAME_KIND = [
    {"running", "walking"}, {"cycling"}, {"swimming"},
    {"strength", "crossfit", "hyrox", "trx", "bodypump", "hiit", "cardio", "yoga", "stretch", "pilates", "boxing"},
]
COLUMNS = ("date", "workout_type", "duration_minutes", "intensity", "calories_burned_est", "energy_level",
           "notes", "details", "garmin_activity_id")


def _details(w) -> dict:
    return dict(w.details) if isinstance(w.details, dict) else {}


def _start_minute(w):
    try:
        h, m = str(_details(w)["start_time"]).split(":")[:2]
        return int(h) * 60 + int(m)
    except (KeyError, ValueError):
        return None


def _kind_matches(a: str, b: str) -> bool:
    a, b = (a or "other").lower(), (b or "other").lower()
    return a == b or "other" in (a, b) or any(a in k and b in k for k in SAME_KIND)


def same_session(a: WorkoutLog, b: WorkoutLog) -> bool:
    """Same day, a matching kind of workout, and starting within 20 minutes of
    each other (or, when one has no start time, about as long)."""
    if a.date != b.date or not _kind_matches(a.workout_type, b.workout_type):
        return False
    sa, sb = _start_minute(a), _start_minute(b)
    if sa is not None and sb is not None:
        return abs(sa - sb) <= MATCH_MINUTES
    da, db = a.duration_minutes or 0, b.duration_minutes or 0
    return max(da, db) > 0 and abs(da - db) <= 0.35 * max(da, db)


async def candidates(db, w: WorkoutLog) -> list:
    """Workouts that look like the same session as w: same user and day, one of
    the two from Garmin and the other not, and not split apart before."""
    rows = (await db.execute(
        select(WorkoutLog).where(WorkoutLog.user_id == w.user_id, WorkoutLog.date == w.date, WorkoutLog.id != w.id)
    )).scalars().all()
    apart = set(_details(w).get("keep_apart_from") or [])
    return [o for o in rows
            if (o.garmin_activity_id is None) != (w.garmin_activity_id is None)
            and o.id not in apart and w.id not in (_details(o).get("keep_apart_from") or [])
            and same_session(w, o)]


def _snapshot(w) -> dict:
    snap = {c: getattr(w, c) for c in COLUMNS}
    snap["date"] = w.date.isoformat()
    return snap


async def link(db, a: WorkoutLog, b: WorkoutLog) -> WorkoutLog:
    """Fold two workouts of the same session into one and return it."""
    if a.id == b.id or a.user_id != b.user_id:
        raise ValueError("Pick two different workouts of your own.")
    if a.garmin_activity_id is not None and b.garmin_activity_id is not None:
        raise ValueError("Both workouts came from Garmin, so they are different activities there.")
    # Keep the logged one; between two logged ones, the older
    keep, other = (b, a) if a.garmin_activity_id is not None else (a, b)
    if keep.garmin_activity_id is None and other.garmin_activity_id is None and other.id < keep.id:
        keep, other = other, keep
    garmin = other if other.garmin_activity_id is not None else None

    kd, od = _details(keep), _details(other)
    details = {**od, **kd}
    if garmin is not None:
        details.update({k: v for k, v in od.items() if k in MEASURED})
    details["source"] = sorted(set(kd.get("source") or ["logged"]) | set(od.get("source") or ["logged"]))
    details.pop("link_suggestions", None)

    sets = (await db.execute(select(WorkoutSet.id).where(WorkoutSet.workout_log_id == other.id))).scalars().all()
    own_track = (await db.execute(select(WorkoutTrack).where(WorkoutTrack.workout_log_id == keep.id))).scalar_one_or_none()
    track = (await db.execute(select(WorkoutTrack).where(WorkoutTrack.workout_log_id == other.id))).scalar_one_or_none()
    keep.link_backup = {
        "kept": _snapshot(keep), "absorbed": _snapshot(other), "absorbed_sets": list(sets),
        "absorbed_track": track is not None and own_track is None, "previous": keep.link_backup,
    }

    values = {
        "details": details,
        "duration_minutes": (garmin.duration_minutes if garmin else keep.duration_minutes) or other.duration_minutes,
        "calories_burned_est": (garmin.calories_burned_est if garmin else None) or keep.calories_burned_est or other.calories_burned_est,
        "intensity": keep.intensity or other.intensity,
        "energy_level": keep.energy_level or other.energy_level,
        "notes": keep.notes or other.notes,
    }
    garmin_id = garmin.garmin_activity_id if garmin else None
    if sets:
        await db.execute(update(WorkoutSet).where(WorkoutSet.id.in_(sets)).values(workout_log_id=keep.id))
    if track is not None:
        if own_track is None:
            track.workout_log_id = keep.id
        else:
            await db.delete(track)
    await db.flush()
    await db.delete(other)
    await db.flush()            # frees the Garmin id before the kept row takes it
    for k, v in values.items():
        setattr(keep, k, v)
    if garmin_id is not None:
        keep.garmin_activity_id = garmin_id
    await db.flush()
    return keep


async def unlink(db, w: WorkoutLog) -> tuple:
    """Split a linked workout back into the two it was made of, and remember
    to keep them apart. Changes made after linking are not carried over."""
    backup = w.link_backup
    if not backup:
        raise ValueError("This workout is not linked to another one.")
    kept, absorbed = backup["kept"], backup["absorbed"]
    for c in COLUMNS:
        setattr(w, c, date_cls.fromisoformat(kept[c]) if c == "date" else kept[c])
    w.link_backup = backup.get("previous")
    await db.flush()            # gives the Garmin id back before the other row is made again
    other = WorkoutLog(user_id=w.user_id, **{c: date_cls.fromisoformat(absorbed[c]) if c == "date" else absorbed[c]
                                             for c in COLUMNS})
    db.add(other)
    await db.flush()
    if backup.get("absorbed_sets"):
        await db.execute(update(WorkoutSet).where(WorkoutSet.id.in_(backup["absorbed_sets"]))
                         .values(workout_log_id=other.id))
    if backup.get("absorbed_track"):
        track = (await db.execute(select(WorkoutTrack).where(WorkoutTrack.workout_log_id == w.id))).scalar_one_or_none()
        if track is not None:
            track.workout_log_id = other.id
    for a, b in ((w, other), (other, w)):
        d = _details(a)
        d["keep_apart_from"] = sorted(set(d.get("keep_apart_from") or []) | {b.id})
        a.details = d
    await db.flush()
    return w, other


async def auto_link(db, w: WorkoutLog) -> tuple:
    """Link w with the one workout that is clearly the same session. Returns
    (the workout that now holds w, whether a link happened). With several
    possible matches nothing is linked; they are offered as suggestions."""
    found = await candidates(db, w)
    if len(found) == 1:
        return await link(db, w, found[0]), True
    if found:
        d = _details(w)
        d["link_suggestions"] = [o.id for o in found]
        w.details = d
        await db.flush()
    return w, False
