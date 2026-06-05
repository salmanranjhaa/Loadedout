"""backend hardening: refresh tokens, fitness tables, RLS policies

Revision ID: 3a4b5c6d7e8f
Revises: 2d4e6f8a9b10
Create Date: 2026-05-05 08:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "3a4b5c6d7e8f"
down_revision: Union[str, None] = "2d4e6f8a9b10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- New tables ---

    # Refresh tokens
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("jti", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("token_family", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_refresh_tokens_id", "refresh_tokens", ["id"])
    op.create_index("ix_refresh_tokens_jti", "refresh_tokens", ["jti"], unique=True)
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])
    op.create_index("ix_refresh_tokens_token_family", "refresh_tokens", ["token_family"])

    # Personal records
    op.create_table(
        "personal_records",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("exercise_name", sa.String(length=100), nullable=False),
        sa.Column("weight_kg", sa.Float(), nullable=False),
        sa.Column("reps", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_personal_records_id", "personal_records", ["id"])
    op.create_index("ix_personal_records_user_id", "personal_records", ["user_id"])
    op.create_index("ix_personal_records_exercise_name", "personal_records", ["exercise_name"])

    # Water logs
    op.create_table(
        "water_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("amount_ml", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "date", name="uq_water_logs_user_date"),
    )
    op.create_index("ix_water_logs_id", "water_logs", ["id"])
    op.create_index("ix_water_logs_user_id", "water_logs", ["user_id"])

    # User goals
    op.create_table(
        "user_goals",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("target_weight_kg", sa.Float(), nullable=True),
        sa.Column("timeline_weeks", sa.Integer(), nullable=True),
        sa.Column("daily_calorie_target", sa.Integer(), nullable=True),
        sa.Column("daily_protein_target", sa.Integer(), nullable=True),
        sa.Column("daily_carb_target", sa.Integer(), nullable=True),
        sa.Column("daily_fat_target", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_user_goals_id", "user_goals", ["id"])
    op.create_index("ix_user_goals_user_id", "user_goals", ["user_id"], unique=True)

    # Workout sets
    op.create_table(
        "workout_sets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("workout_log_id", sa.Integer(), sa.ForeignKey("workout_logs.id"), nullable=False),
        sa.Column("exercise_name", sa.String(length=100), nullable=False),
        sa.Column("set_number", sa.Integer(), nullable=False),
        sa.Column("reps", sa.Integer(), nullable=True),
        sa.Column("weight_kg", sa.Float(), nullable=True),
        sa.Column("rpe", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_workout_sets_id", "workout_sets", ["id"])
    op.create_index("ix_workout_sets_user_id", "workout_sets", ["user_id"])
    op.create_index("ix_workout_sets_workout_log_id", "workout_sets", ["workout_log_id"])
    op.create_index("ix_workout_sets_exercise_name", "workout_sets", ["exercise_name"])

    # --- RLS Policies ---
    # We use a session-level setting 'app.current_user_id' that the backend sets per request.
    # The NULLIF(..., '') wrapper prevents errors when the setting is unset (e.g. during migrations).

    _rls_tables = [
        "schedule_events",
        "schedule_modifications",
        "meal_templates",
        "meal_logs",
        "grocery_lists",
        "weight_logs",
        "workout_logs",
        "workout_templates",
        "daily_snapshots",
        "chat_sessions",
        "google_oauth_tokens",
        "budget_entries",
        "inventory_items",
        "refresh_tokens",
        "personal_records",
        "water_logs",
        "user_goals",
        "workout_sets",
    ]

    for table in _rls_tables:
        op.execute(f'ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;')
        op.execute(f"""
            CREATE POLICY {table}_isolation ON {table}
            FOR ALL
            USING (
                user_id = NULLIF(current_setting('app.current_user_id', true), '')::integer
            )
            WITH CHECK (
                user_id = NULLIF(current_setting('app.current_user_id', true), '')::integer
            );
        """)

    # Users table needs special handling: SELECT must be open for auth endpoints,
    # while UPDATE/DELETE are restricted to the owner.
    op.execute('ALTER TABLE users ENABLE ROW LEVEL SECURITY;')
    op.execute("""
        CREATE POLICY users_select ON users
        FOR SELECT
        USING (true);
    """)
    op.execute("""
        CREATE POLICY users_update ON users
        FOR UPDATE
        USING (
            id = NULLIF(current_setting('app.current_user_id', true), '')::integer
        )
        WITH CHECK (
            id = NULLIF(current_setting('app.current_user_id', true), '')::integer
        );
    """)
    op.execute("""
        CREATE POLICY users_insert ON users
        FOR INSERT
        WITH CHECK (true);
    """)
    op.execute("""
        CREATE POLICY users_delete ON users
        FOR DELETE
        USING (
            id = NULLIF(current_setting('app.current_user_id', true), '')::integer
        );
    """)


def downgrade() -> None:
    # Drop RLS policies
    _rls_tables = [
        "schedule_events",
        "schedule_modifications",
        "meal_templates",
        "meal_logs",
        "grocery_lists",
        "weight_logs",
        "workout_logs",
        "workout_templates",
        "daily_snapshots",
        "chat_sessions",
        "google_oauth_tokens",
        "budget_entries",
        "inventory_items",
        "refresh_tokens",
        "personal_records",
        "water_logs",
        "user_goals",
        "workout_sets",
    ]

    for table in _rls_tables:
        op.execute(f'DROP POLICY IF EXISTS {table}_isolation ON {table};')
        op.execute(f'ALTER TABLE {table} DISABLE ROW LEVEL SECURITY;')

    op.execute('DROP POLICY IF EXISTS users_select ON users;')
    op.execute('DROP POLICY IF EXISTS users_insert ON users;')
    op.execute('DROP POLICY IF EXISTS users_update ON users;')
    op.execute('DROP POLICY IF EXISTS users_delete ON users;')
    op.execute('ALTER TABLE users DISABLE ROW LEVEL SECURITY;')

    # Drop indexes and tables
    op.drop_index("ix_workout_sets_exercise_name", table_name="workout_sets")
    op.drop_index("ix_workout_sets_workout_log_id", table_name="workout_sets")
    op.drop_index("ix_workout_sets_user_id", table_name="workout_sets")
    op.drop_index("ix_workout_sets_id", table_name="workout_sets")
    op.drop_table("workout_sets")

    op.drop_index("ix_user_goals_user_id", table_name="user_goals")
    op.drop_index("ix_user_goals_id", table_name="user_goals")
    op.drop_table("user_goals")

    op.drop_index("ix_water_logs_user_id", table_name="water_logs")
    op.drop_index("ix_water_logs_id", table_name="water_logs")
    op.drop_table("water_logs")

    op.drop_index("ix_personal_records_exercise_name", table_name="personal_records")
    op.drop_index("ix_personal_records_user_id", table_name="personal_records")
    op.drop_index("ix_personal_records_id", table_name="personal_records")
    op.drop_table("personal_records")

    op.drop_index("ix_refresh_tokens_token_family", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_user_id", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_jti", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_id", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
