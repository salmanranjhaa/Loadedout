from sqlalchemy import Column, Integer, String, DateTime, JSON, Text, ForeignKey, Date, UniqueConstraint
from sqlalchemy.sql import func
from app.core.database import Base


# What a new connection imports and how often it syncs on its own
DEFAULT_GARMIN_SETTINGS = {
    "enabled": True,
    "activities": True,
    "health": True,
    "sleep": True,
    "full_history": True,
    "auto_sync_hours": 3,     # 0 = only when asked
}


class GarminConnection(Base):
    """One user's Garmin Connect link: their personal API key (encrypted) and how syncing went."""
    __tablename__ = "garmin_connections"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True)
    api_key_encrypted = Column(Text, nullable=True)
    settings = Column(JSON, nullable=True)
    # new, ok, error (Garmin or network trouble), key_error (key refused)
    status = Column(String(20), nullable=False, default="new")
    last_sync_at = Column(DateTime(timezone=True), nullable=True)
    last_result = Column(JSON, nullable=True)
    last_error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class HealthDay(Base):
    """A day of all-day data from the watch. The columns are what trends need;
    data holds the rest: heart rate samples, body battery, stress, sleep stages."""
    __tablename__ = "health_days"
    __table_args__ = (UniqueConstraint("user_id", "date", name="uq_health_days_user_date"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    date = Column(Date, nullable=False)
    steps = Column(Integer, nullable=True)
    step_goal = Column(Integer, nullable=True)
    resting_hr = Column(Integer, nullable=True)
    sleep_seconds = Column(Integer, nullable=True)
    stress_avg = Column(Integer, nullable=True)
    data = Column(JSON, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class WorkoutTrack(Base):
    """The GPS route and the numbers along it (pace, heart rate, elevation…) for one workout."""
    __tablename__ = "workout_tracks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    workout_log_id = Column(Integer, ForeignKey("workout_logs.id", ondelete="CASCADE"), nullable=False, unique=True)
    route = Column(JSON, nullable=True)      # [[lat, lon], …], at most a few hundred points
    preview = Column(JSON, nullable=True)    # ~40 points for list thumbnails
    streams = Column(JSON, nullable=True)    # {"distance_km": […], "hr": […], "pace_s_per_km": […], …}
