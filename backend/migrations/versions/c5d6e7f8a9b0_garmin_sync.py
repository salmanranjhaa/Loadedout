"""garmin sync: per-user Garmin connection, daily health data, workout routes

Adds garmin_connections (encrypted personal API key + sync settings),
health_days (steps, heart rate, sleep, body battery… per day), workout_tracks
(GPS route and pace/heart rate/elevation along it) and on workout_logs the
Garmin activity id plus the backup that lets a linked workout be split again.
The new tables get the same per-user row-level security policy as the others.

Revision ID: c5d6e7f8a9b0
Revises: b4c5d6e7f8a9
Create Date: 2026-10-27
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "c5d6e7f8a9b0"
down_revision: Union[str, None] = "b4c5d6e7f8a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NEW_TABLES = ("garmin_connections", "health_days", "workout_tracks")


def upgrade() -> None:
    op.add_column("workout_logs", sa.Column("garmin_activity_id", sa.BigInteger(), nullable=True))
    op.add_column("workout_logs", sa.Column("link_backup", sa.JSON(), nullable=True))
    op.create_unique_constraint("uq_workout_logs_user_garmin", "workout_logs", ["user_id", "garmin_activity_id"])

    op.create_table(
        "garmin_connections",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, unique=True),
        sa.Column("api_key_encrypted", sa.Text(), nullable=True),
        sa.Column("settings", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="new"),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_result", sa.JSON(), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_garmin_connections_id", "garmin_connections", ["id"])

    op.create_table(
        "health_days",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("steps", sa.Integer(), nullable=True),
        sa.Column("step_goal", sa.Integer(), nullable=True),
        sa.Column("resting_hr", sa.Integer(), nullable=True),
        sa.Column("sleep_seconds", sa.Integer(), nullable=True),
        sa.Column("stress_avg", sa.Integer(), nullable=True),
        sa.Column("data", sa.JSON(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("user_id", "date", name="uq_health_days_user_date"),
    )
    op.create_index("ix_health_days_id", "health_days", ["id"])
    op.create_index("ix_health_days_user_id", "health_days", ["user_id"])

    op.create_table(
        "workout_tracks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("workout_log_id", sa.Integer(), sa.ForeignKey("workout_logs.id", ondelete="CASCADE"),
                  nullable=False, unique=True),
        sa.Column("route", sa.JSON(), nullable=True),
        sa.Column("preview", sa.JSON(), nullable=True),
        sa.Column("streams", sa.JSON(), nullable=True),
    )
    op.create_index("ix_workout_tracks_id", "workout_tracks", ["id"])
    op.create_index("ix_workout_tracks_user_id", "workout_tracks", ["user_id"])

    for table in NEW_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;")
        op.execute(f"""
            CREATE POLICY {table}_isolation ON {table}
            FOR ALL
            USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::integer)
            WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::integer);
        """)


def downgrade() -> None:
    for table in reversed(NEW_TABLES):
        op.drop_table(table)
    op.drop_constraint("uq_workout_logs_user_garmin", "workout_logs", type_="unique")
    op.drop_column("workout_logs", "link_backup")
    op.drop_column("workout_logs", "garmin_activity_id")
