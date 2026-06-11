"""add profile personalization fields (full_name, avatar, goals, training prefs)

Revision ID: b7c8d9e0f1a2
Revises: d74115dd9064
Create Date: 2026-06-11
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b7c8d9e0f1a2"
down_revision: Union[str, None] = "d74115dd9064"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("full_name", sa.String(120), nullable=True))
    op.add_column("users", sa.Column("avatar_id", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("activity_level", sa.String(32), nullable=True))
    op.add_column("users", sa.Column("fitness_goal", sa.String(32), nullable=True))
    op.add_column("users", sa.Column("goal_pace_kg_per_week", sa.Float(), nullable=True))
    op.add_column("users", sa.Column("training_preferences", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "training_preferences")
    op.drop_column("users", "goal_pace_kg_per_week")
    op.drop_column("users", "fitness_goal")
    op.drop_column("users", "activity_level")
    op.drop_column("users", "avatar_id")
    op.drop_column("users", "full_name")
