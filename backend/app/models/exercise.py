from sqlalchemy import Column, Integer, String, DateTime, JSON, Text
from sqlalchemy.sql import func
from app.core.database import Base


class Exercise(Base):
    """I store the master exercise library with media URLs and cached LLM guidance."""
    __tablename__ = "exercises"

    id = Column(String(80), primary_key=True, index=True)
    name = Column(String(120), nullable=False, index=True)
    body_part = Column(String(50), nullable=True, index=True)
    equipment = Column(String(50), nullable=True, index=True)
    primary_muscles = Column(JSON, nullable=True)
    secondary_muscles = Column(JSON, nullable=True)
    instructions = Column(JSON, nullable=True)
    image_start_url = Column(String(255), nullable=True)
    image_end_url = Column(String(255), nullable=True)
    gif_url = Column(String(255), nullable=True)
    category = Column(String(30), nullable=True)
    level = Column(String(20), nullable=True)
    force = Column(String(20), nullable=True)
    mechanic = Column(String(20), nullable=True)

    # Cached LLM enrichment — shared across all users
    llm_description = Column(Text, nullable=True)
    llm_enriched_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
