from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
import os
import sys

# I add the app directory to the path so I can import models
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.core.database import Base
from app.models.user import User, RefreshToken  # noqa: F401
from app.models.schedule import ScheduleEvent, ScheduleModification
from app.models.meal import MealTemplate, MealLog, GroceryList
from app.models.analytics import WeightLog, WorkoutLog, DailySnapshot
from app.models.chat import ChatSession  # noqa: F401
from app.models.google_oauth import GoogleOAuthToken  # noqa: F401
from app.models.fitness import PersonalRecord, WaterLog, UserGoal, WorkoutSet  # noqa: F401
from app.models.budget import BudgetEntry  # noqa: F401
from app.models.inventory import InventoryItem  # noqa: F401
from app.models.exercise import Exercise  # noqa: F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Override alembic.ini URL with DATABASE_URL_SYNC env var if set
_db_url = os.environ.get("DATABASE_URL_SYNC")
if _db_url:
    config.set_main_option("sqlalchemy.url", _db_url)

target_metadata = Base.metadata


def run_migrations_offline():
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
