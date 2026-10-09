from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey, Date
from sqlalchemy.sql import func
from app.core.database import Base


# Entries that are not spending: money coming in, and paying off the credit
# card (moves cash to the card; the purchases were already counted).
NON_SPENDING_CATEGORIES = {"income", "savings", "card_payment"}


class BudgetEntry(Base):
    """I track daily expenses for budget monitoring and analytics."""
    __tablename__ = "budget_entries"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    amount = Column(Float, nullable=False)
    category = Column(String(50), nullable=False)  # food, transport, uni, health, entertainment, shopping, other
    description = Column(String(255), nullable=True)
    date = Column(Date, nullable=False)
    # How an expense was paid: "cash" (incl. debit) or "card" (credit card, still to pay)
    payment_method = Column(String(10), nullable=False, server_default="cash")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
