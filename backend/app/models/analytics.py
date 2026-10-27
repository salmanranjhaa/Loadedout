from sqlalchemy import BigInteger, Column, Integer, String, Float, DateTime, JSON, Boolean, Text, ForeignKey, Date, UniqueConstraint
from sqlalchemy.sql import func
from app.core.database import Base


class WeightLog(Base):
    """I track daily weight to monitor progress over time."""
    __tablename__ = "weight_logs"
    __table_args__ = (UniqueConstraint("user_id", "date", name="uq_weight_logs_user_date"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    date = Column(Date, nullable=False)
    weight_kg = Column(Float, nullable=False)
    
    # I optionally store body measurements
    body_fat_pct = Column(Float, nullable=True)
    waist_cm = Column(Float, nullable=True)
    
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class WorkoutLog(Base):
    """I log workouts to track fitness progress and correlate with nutrition."""
    __tablename__ = "workout_logs"
    __table_args__ = (UniqueConstraint("user_id", "garmin_activity_id", name="uq_workout_logs_user_garmin"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    date = Column(Date, nullable=False)
    workout_type = Column(String(50), nullable=False)  # crossfit, running, football, yoga, cycling
    
    # I store duration and intensity
    duration_minutes = Column(Integer, nullable=False)
    intensity = Column(String(20), nullable=True)  # light, moderate, high
    
    # I store workout specific data
    details = Column(JSON, nullable=True)
    # Running: {"distance_km": 5.2, "avg_pace": "5:30/km", "elevation_gain_m": 120}
    # CrossFit: {"wod_name": "Fran", "score": "8:45", "movements": ["thrusters", "pull-ups"]}
    
    calories_burned_est = Column(Integer, nullable=True)
    
    # I store how the user felt
    energy_level = Column(Integer, nullable=True)  # 1 to 5
    notes = Column(Text, nullable=True)
    
    # I generate embedding for RAG context
    embedding = Column(JSON, nullable=True)

    # I store the full AI analysis result from Gemini
    ai_analysis = Column(JSON, nullable=True)

    # The Garmin activity this workout came from or was linked to
    garmin_activity_id = Column(BigInteger, nullable=True)
    # Both workouts as they were before being linked into this one, so unlinking
    # can split them again (see app/services/workout_links.py)
    link_backup = Column(JSON, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())


class WorkoutTemplate(Base):
    """I store reusable workout templates suggested by AI or created by the user."""
    __tablename__ = "workout_templates"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    name = Column(String(100), nullable=False)
    workout_type = Column(String(30), nullable=False)  # strength, crossfit, running, hiit, etc.

    # I store exercise list for strength/CrossFit (sets, reps, weight_suggestion)
    exercises = Column(JSON, nullable=True)

    # I store description for cardio or general workout
    description = Column(Text, nullable=True)

    estimated_duration = Column(Integer, nullable=True)  # minutes
    tags = Column(JSON, nullable=True)  # ["chest", "biceps", "strength"]

    source = Column(String(20), default="ai_suggested")  # "ai_suggested", "user"
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class DailySnapshot(Base):
    """I create a daily summary for analytics dashboards."""
    __tablename__ = "daily_snapshots"
    __table_args__ = (UniqueConstraint("user_id", "date", name="uq_daily_snapshots_user_date"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    date = Column(Date, nullable=False)
    
    # I aggregate nutrition data
    total_calories = Column(Float, nullable=True)
    total_protein_g = Column(Float, nullable=True)
    total_carbs_g = Column(Float, nullable=True)
    total_fat_g = Column(Float, nullable=True)
    meals_logged = Column(Integer, default=0)
    
    # I aggregate fitness data
    workouts_completed = Column(Integer, default=0)
    total_workout_minutes = Column(Integer, default=0)
    est_calories_burned = Column(Integer, default=0)
    
    # I track weight if logged
    weight_kg = Column(Float, nullable=True)
    
    # I track schedule adherence
    events_scheduled = Column(Integer, default=0)
    events_completed = Column(Integer, default=0)
    adherence_pct = Column(Float, nullable=True)
    
    # I track study/work hours
    thesis_hours = Column(Float, default=0)
    job_hunt_hours = Column(Float, default=0)
    study_hours = Column(Float, default=0)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
