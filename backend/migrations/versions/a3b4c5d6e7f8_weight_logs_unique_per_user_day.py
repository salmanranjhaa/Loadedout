"""weight_logs: one entry per user per day, not one per day for everyone

The initial schema made weight_logs.date unique on its own, so once anyone
logged a weight for a day nobody else could. The model always meant
(user_id, date); this makes the database match it.

Revision ID: a3b4c5d6e7f8
Revises: f2a3b4c5d6e7
Create Date: 2026-10-27
"""
from typing import Sequence, Union

from alembic import op

revision: str = "a3b4c5d6e7f8"
down_revision: Union[str, None] = "f2a3b4c5d6e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE weight_logs DROP CONSTRAINT IF EXISTS weight_logs_date_key")
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_weight_logs_user_date') THEN
                ALTER TABLE weight_logs ADD CONSTRAINT uq_weight_logs_user_date UNIQUE (user_id, date);
            END IF;
        END $$;
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE weight_logs DROP CONSTRAINT IF EXISTS uq_weight_logs_user_date")
    op.execute("ALTER TABLE weight_logs ADD CONSTRAINT weight_logs_date_key UNIQUE (date)")
