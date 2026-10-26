from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Date, UniqueConstraint
from sqlalchemy.sql import func
from app.core.database import Base


# Money coming into an account
INFLOW_CATEGORIES = {"income", "savings"}
# Money moving between two of the user's accounts: card_payment pays a credit
# card bill, transfer is anything else (e.g. topping up Revolut from the bank)
TRANSFER_CATEGORIES = {"transfer", "card_payment"}
# Entries that are not spending
NON_SPENDING_CATEGORIES = INFLOW_CATEGORIES | TRANSFER_CATEGORIES

# Monthly budget per category until the user sets their own
DEFAULT_BUDGET_LIMITS = {"food": 400, "rent": 1200, "transport": 150, "fitness": 80, "fun": 200, "other": 150}


class BudgetAccount(Base):
    """A bank account or credit card that budget entries are paid from or into."""
    __tablename__ = "budget_accounts"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_budget_accounts_user_name"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(60), nullable=False)
    kind = Column(String(20), nullable=False, server_default="bank")  # bank | credit_card
    # What the account held before its first entry; a credit card owing money is negative
    opening_balance = Column(Float, nullable=False, server_default="0")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class BudgetEntry(Base):
    """I track daily expenses for budget monitoring and analytics."""
    __tablename__ = "budget_entries"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    amount = Column(Float, nullable=False)
    category = Column(String(50), nullable=False)  # food, rent, transport, fitness, fun, other, income, savings, transfer, card_payment
    description = Column(String(255), nullable=True)
    # A date after today is scheduled: it moves the balance only once that day comes
    date = Column(Date, nullable=False)
    # The account the money leaves (spending, transfers) or arrives in (income)
    account_id = Column(Integer, ForeignKey("budget_accounts.id"), nullable=True, index=True)
    # Transfers only: the account the money arrives in
    to_account_id = Column(Integer, ForeignKey("budget_accounts.id"), nullable=True)
    # Kept for older app versions: "card" when spent on a credit card account
    payment_method = Column(String(10), nullable=False, server_default="cash")

    created_at = Column(DateTime(timezone=True), server_default=func.now())


def entry_effect(entry, account_id: int) -> float:
    """How much an entry changes one account's balance."""
    if entry.to_account_id == account_id:
        return entry.amount
    if entry.account_id != account_id:
        return 0.0
    return entry.amount if entry.category in INFLOW_CATEGORIES else -entry.amount
