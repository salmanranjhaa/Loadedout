from sqlalchemy import Column, Integer, String, Float, DateTime, Date, ForeignKey, Text
from sqlalchemy.sql import func
from app.core.database import Base


class InventoryItem(Base):
    """I track what food items Sal currently has at home."""
    __tablename__ = "inventory_items"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    name = Column(String(100), nullable=False)
    quantity = Column(Float, nullable=True)
    unit = Column(String(20), nullable=True)  # g, kg, pieces, tbsp, cups, L, ml, cans
    category = Column(String(30), nullable=True)  # protein, carbs, veggies, dairy, spices, fats, other

    # I track when pantry items expire so the user knows what to use first.
    expiry_date = Column(Date, nullable=True)

    # Same columns as the Notion pantry: ok / running_low / need_to_buy,
    # pantry / fridge / freezer, and free text.
    status = Column(String(20), nullable=False, server_default="ok")
    storage = Column(String(20), nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
