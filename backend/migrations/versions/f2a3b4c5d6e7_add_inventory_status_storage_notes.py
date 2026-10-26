"""add inventory_items.status, storage and notes

status is ok / running_low / need_to_buy (existing items become "ok"),
storage is pantry / fridge / freezer, notes is free text.

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-10-27
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "f2a3b4c5d6e7"
down_revision: Union[str, None] = "e1f2a3b4c5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("inventory_items", sa.Column("status", sa.String(20), nullable=False, server_default="ok"))
    op.add_column("inventory_items", sa.Column("storage", sa.String(20), nullable=True))
    op.add_column("inventory_items", sa.Column("notes", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("inventory_items", "notes")
    op.drop_column("inventory_items", "storage")
    op.drop_column("inventory_items", "status")
