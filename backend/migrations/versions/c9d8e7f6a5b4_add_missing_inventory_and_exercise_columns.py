"""add inventory_items.expiry_date and exercises.gif_url

Both columns exist in the models but no migration created them, so a database
built with `alembic upgrade head` broke the Pantry and the exercise search.
Production already has them (added by hand), hence IF NOT EXISTS.

Revision ID: c9d8e7f6a5b4
Revises: b7c8d9e0f1a2
Create Date: 2026-10-05
"""
from typing import Sequence, Union

from alembic import op

revision: str = "c9d8e7f6a5b4"
down_revision: Union[str, None] = "b7c8d9e0f1a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS expiry_date DATE")
    op.execute("ALTER TABLE exercises ADD COLUMN IF NOT EXISTS gif_url VARCHAR(255)")


def downgrade() -> None:
    op.execute("ALTER TABLE exercises DROP COLUMN IF EXISTS gif_url")
    op.execute("ALTER TABLE inventory_items DROP COLUMN IF EXISTS expiry_date")
