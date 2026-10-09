"""add budget_entries.payment_method (cash or credit card)

Existing entries become "cash", which is what they were assumed to be.

Revision ID: d0e1f2a3b4c5
Revises: c9d8e7f6a5b4
Create Date: 2026-10-09
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "d0e1f2a3b4c5"
down_revision: Union[str, None] = "c9d8e7f6a5b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "budget_entries",
        sa.Column("payment_method", sa.String(10), nullable=False, server_default="cash"),
    )


def downgrade() -> None:
    op.drop_column("budget_entries", "payment_method")
