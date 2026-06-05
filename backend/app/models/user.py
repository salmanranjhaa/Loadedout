from sqlalchemy import Column, Integer, String, Float, DateTime, JSON, Boolean, Text, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="user", server_default="user")
    google_sub = Column(String(128), unique=True, nullable=True, index=True)

    # I keep physical stats nullable until a user explicitly sets them.
    current_weight_kg = Column(Float, nullable=True)
    target_weight_kg = Column(Float, nullable=True)
    height_cm = Column(Float, nullable=True)
    age = Column(Integer, nullable=True)
    gender = Column(String(32), nullable=True)

    # I store dietary preferences as JSON for flexibility.
    dietary_preferences = Column(JSON, default=lambda: {
        "dietary_pattern": None,
        "allergies": [],
        "disliked_foods": [],
        "preferred_foods": [],
        "notes": "",
    })

    # I store daily macro targets and user-preferred currency.
    daily_calorie_target = Column(Integer, nullable=True)
    daily_protein_target = Column(Integer, nullable=True)
    daily_carb_target = Column(Integer, nullable=True)
    daily_fat_target = Column(Integer, nullable=True)
    preferred_currency = Column(String(8), nullable=False, default="CHF", server_default="CHF")

    # I store supplement schedule as JSON.
    supplements = Column(JSON, default=lambda: {
        "morning": [],
        "pre_workout": [],
        "post_workout": [],
        "before_bed": [],
    })

    # I store routine preferences that the RAG system can reference.
    routine_preferences = Column(JSON, default=lambda: {
        "wake_up_weekday": None,
        "wake_up_weekend": None,
        "bedtime": None,
        "notes": "",
    })

    # I store grocery preferences.
    grocery_stores = Column(JSON, default=lambda: {
        "primary": [],
        "notes": "",
    })

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class RefreshToken(Base):
    """I store refresh tokens for rotation and reuse detection."""
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    jti = Column(String(64), unique=True, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_family = Column(String(64), nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
