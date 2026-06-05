from sqlalchemy import Column, Integer, String, Float, DateTime, JSON, Boolean, Text, ForeignKey, Date, UniqueConstraint
from sqlalchemy.sql import func
from app.core.database import Base


class PersonalRecord(Base):
    """I track personal records for individual exercises."""
    __tablename__ = "personal_records"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    exercise_name = Column(String(100), nullable=False, index=True)
    weight_kg = Column(Float, nullable=False)
    reps = Column(Integer, nullable=False)
    date = Column(Date, nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class WaterLog(Base):
    """I track daily water intake."""
    __tablename__ = "water_logs"
    __table_args__ = (UniqueConstraint("user_id", "date", name="uq_water_logs_user_date"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    amount_ml = Column(Integer, nullable=False)
    date = Column(Date, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class UserGoal(Base):
    """I store user-defined fitness and nutrition goals."""
    __tablename__ = "user_goals"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True, index=True)
    target_weight_kg = Column(Float, nullable=True)
    timeline_weeks = Column(Integer, nullable=True)
    daily_calorie_target = Column(Integer, nullable=True)
    daily_protein_target = Column(Integer, nullable=True)
    daily_carb_target = Column(Integer, nullable=True)
    daily_fat_target = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class WorkoutSet(Base):
    """I store individual sets within a workout log for detailed tracking."""
    __tablename__ = "workout_sets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    workout_log_id = Column(Integer, ForeignKey("workout_logs.id"), nullable=False, index=True)
    exercise_name = Column(String(100), nullable=False, index=True)
    set_number = Column(Integer, nullable=False)
    reps = Column(Integer, nullable=True)
    weight_kg = Column(Float, nullable=True)
    rpe = Column(Integer, nullable=True)  # Rate of Perceived Exertion 1-10
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
