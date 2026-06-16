"""
Loadout MCP Server

I expose tools so Claude Cowork (or any MCP client) can read and write
directly into the Loadout PostgreSQL database on behalf of a user.

Connect via SSE at: http://<VM_IP>:8003/sse
"""

import asyncio
import json
import os
from datetime import date as date_cls, datetime, time as time_cls
from typing import Any, Optional

import asyncpg
from mcp.server import Server
from mcp.server.sse import SseServerTransport
from mcp.types import TextContent, Tool
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import Response
from starlette.routing import Mount, Route
import uvicorn

# I read credentials from environment, falling back to defaults for local dev
DATABASE_URL = os.environ.get(
    "MCP_DATABASE_URL",
    "postgresql://lifeplan_user:changeme@db:5432/lifeplan_db",
)

# I keep a module-level connection pool so all tool calls share it
_pool: Optional[asyncpg.Pool] = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    return _pool


async def resolve_user_id(conn: asyncpg.Connection, email: str) -> int:
    """I look up the user id by email, raising a clear error if not found."""
    row = await conn.fetchrow(
        "SELECT id FROM users WHERE email = $1 AND is_active = true", email
    )
    if not row:
        raise ValueError(f"No active user found with email: {email}")
    return row["id"]


def _serialize(val: Any) -> Any:
    """I recursively convert asyncpg Record objects and dates to plain dicts/strings."""
    if isinstance(val, asyncpg.Record):
        return {k: _serialize(v) for k, v in dict(val).items()}
    if isinstance(val, list):
        return [_serialize(v) for v in val]
    if isinstance(val, (date_cls, datetime)):
        return val.isoformat()
    return val


def _parse_time(t) -> time_cls:
    """I convert a time string (HH:MM or HH:MM:SS) to a datetime.time object.
    asyncpg requires a proper time_cls instance, not a raw string."""
    if isinstance(t, time_cls):
        return t
    parts = str(t).strip().split(":")
    h, m = int(parts[0]), int(parts[1])
    s = int(parts[2]) if len(parts) > 2 else 0
    return time_cls(h, m, s)


server = Server("loadout")


# ---- Tool definitions ----

@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="get_profile",
            description=(
                "Get a Loadout user's profile: physical stats, macro targets, "
                "supplements, dietary preferences, and routine preferences."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "user_email": {"type": "string", "description": "The user's email address"},
                },
                "required": ["user_email"],
            },
        ),
        Tool(
            name="update_profile",
            description=(
                "Update any combination of profile fields for a Loadout user: "
                "weight, height, age, gender, macro targets, dietary preferences, "
                "supplements, routine preferences."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "user_email": {"type": "string"},
                    "current_weight_kg": {"description": "numeric"},
                    "target_weight_kg": {"description": "numeric"},
                    "height_cm": {"description": "numeric"},
                    "age": {"description": "numeric"},
                    "gender": {"type": "string"},
                    "daily_calorie_target": {"description": "numeric"},
                    "daily_protein_target": {"description": "numeric"},
                    "daily_carb_target": {"description": "numeric"},
                    "daily_fat_target": {"description": "numeric"},
                    "dietary_preferences": {
                        "type": "object",
                        "description": (
                            "JSON with keys: dietary_pattern, allergies (list), "
                            "disliked_foods (list), preferred_foods (list), notes"
                        ),
                    },
                    "supplements": {
                        "type": "object",
                        "description": (
                            "JSON with keys: morning (list), pre_workout (list), "
                            "post_workout (list), before_bed (list)"
                        ),
                    },
                    "routine_preferences": {
                        "type": "object",
                        "description": (
                            "JSON with keys: wake_up_weekday, wake_up_weekend, bedtime, notes"
                        ),
                    },
                },
                "required": ["user_email"],
            },
        ),
        Tool(
            name="get_schedule",
            description=(
                "Get schedule events for a user. "
                "Optionally filter by day_of_week (0=Monday, 6=Sunday) "
                "or by a specific date string (YYYY-MM-DD). "
                "Returns all active events sorted by day and start time."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "user_email": {"type": "string"},
                    "day_of_week": {
                        "description": "numeric value",
                        "minimum": 0,
                        "maximum": 6,
                        "description": "0=Monday, 6=Sunday",
                    },
                    "target_date": {
                        "type": "string",
                        "description": "YYYY-MM-DD, returns events for that weekday",
                    },
                },
                "required": ["user_email"],
            },
        ),
        Tool(
            name="add_schedule_event",
            description=(
                "Add a new recurring or one-off schedule event. "
                "event_type must be one of: routine, meal, exercise, focus, class, social, work. "
                "recurrence: weekly (default), biweekly, or once. "
                "For one-off events set recurrence=once and provide specific_date (YYYY-MM-DD)."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "user_email": {"type": "string"},
                    "title": {"type": "string"},
                    "event_type": {
                        "type": "string",
                        "enum": ["routine", "meal", "exercise", "focus", "class", "social", "work"],
                    },
                    "day_of_week": {
                        "description": "numeric value",
                        "minimum": 0,
                        "maximum": 6,
                        "description": "0=Monday, required for weekly/biweekly events",
                    },
                    "start_time": {"type": "string", "description": "HH:MM format"},
                    "end_time": {"type": "string", "description": "HH:MM format"},
                    "description": {"type": "string"},
                    "location": {"type": "string"},
                    "recurrence": {
                        "type": "string",
                        "enum": ["weekly", "biweekly", "once"],
                        "default": "weekly",
                    },
                    "specific_date": {
                        "type": "string",
                        "description": "YYYY-MM-DD, required when recurrence=once",
                    },
                    "event_data": {
                        "type": "object",
                        "description": "Extra metadata (meal details, exercise type, etc.)",
                    },
                },
                "required": ["user_email", "title", "event_type", "start_time", "end_time"],
            },
        ),
        Tool(
            name="update_schedule_event",
            description="Update fields of an existing schedule event by its ID.",
            inputSchema={
                "type": "object",
                "properties": {
                    "user_email": {"type": "string"},
                    "event_id": {"description": "numeric"},
                    "title": {"type": "string"},
                    "start_time": {"type": "string", "description": "HH:MM"},
                    "end_time": {"type": "string", "description": "HH:MM"},
                    "day_of_week": { "minimum": 0, "maximum": 6},
                    "description": {"type": "string"},
                    "location": {"type": "string"},
                    "event_data": {"type": "object"},
                    "is_active": {"type": "boolean"},
                    "reason": {
                        "type": "string",
                        "description": "Why the event is being changed (logged for AI pattern learning)",
                    },
                },
                "required": ["user_email", "event_id"],
            },
        ),
        Tool(
            name="delete_schedule_event",
            description="Soft-delete (deactivate) a schedule event by its ID.",
            inputSchema={
                "type": "object",
                "properties": {
                    "user_email": {"type": "string"},
                    "event_id": {"description": "numeric"},
                    "reason": {"type": "string"},
                },
                "required": ["user_email", "event_id"],
            },
        ),
        Tool(
            name="get_meal_templates",
            description=(
                "List saved meal templates for a user. "
                "Optionally filter by meal_type: breakfast, lunch, dinner, or snack."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "user_email": {"type": "string"},
                    "meal_type": {
                        "type": "string",
                        "enum": ["breakfast", "lunch", "dinner", "snack"],
                    },
                },
                "required": ["user_email"],
            },
        ),
        Tool(
            name="add_meal_template",
            description=(
                "Add a new meal template with full nutritional breakdown and ingredients. "
                "ingredients is a list of objects with keys: name, amount_g, calories, protein."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "user_email": {"type": "string"},
                    "name": {"type": "string"},
                    "meal_type": {
                        "type": "string",
                        "enum": ["breakfast", "lunch", "dinner", "snack"],
                    },
                    "calories": {"description": "numeric"},
                    "protein_g": {"description": "numeric"},
                    "carbs_g": {"description": "numeric"},
                    "fat_g": {"description": "numeric"},
                    "fiber_g": {"description": "numeric"},
                    "ingredients": {
                        "type": "array",
                        "items": {"type": "object"},
                        "description": (
                            "List of ingredient objects, e.g. "
                            '[{"name": "chicken breast", "amount_g": 150, "calories": 165, "protein": 31}]'
                        ),
                    },
                    "prep_instructions": {"type": "string"},
                    "prep_time_minutes": {"description": "numeric"},
                },
                "required": ["user_email", "name", "meal_type", "calories", "protein_g", "ingredients"],
            },
        ),
        Tool(
            name="update_meal_template",
            description="Update fields of an existing meal template by its ID.",
            inputSchema={
                "type": "object",
                "properties": {
                    "user_email": {"type": "string"},
                    "template_id": {"description": "numeric"},
                    "name": {"type": "string"},
                    "calories": {"description": "numeric"},
                    "protein_g": {"description": "numeric"},
                    "carbs_g": {"description": "numeric"},
                    "fat_g": {"description": "numeric"},
                    "fiber_g": {"description": "numeric"},
                    "ingredients": {"type": "array", "items": {"type": "object"}},
                    "prep_instructions": {"type": "string"},
                    "prep_time_minutes": {"description": "numeric"},
                    "is_active": {"type": "boolean"},
                },
                "required": ["user_email", "template_id"],
            },
        ),
        Tool(
            name="log_meal",
            description=(
                "Log an actual meal eaten by the user on a given date (defaults to today). "
                "Optionally reference a template_id if the meal is based on a saved template."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "user_email": {"type": "string"},
                    "meal_type": {
                        "type": "string",
                        "enum": ["breakfast", "lunch", "dinner", "snack"],
                    },
                    "name": {"type": "string"},
                    "calories": {"description": "numeric"},
                    "protein_g": {"description": "numeric"},
                    "carbs_g": {"description": "numeric"},
                    "fat_g": {"description": "numeric"},
                    "date": {
                        "type": "string",
                        "description": "YYYY-MM-DD, defaults to today if omitted",
                    },
                    "notes": {"type": "string"},
                    "template_id": {"description": "numeric"},
                    "custom_ingredients": {
                        "type": "array",
                        "items": {"type": "object"},
                    },
                },
                "required": ["user_email", "meal_type", "name", "calories", "protein_g"],
            },
        ),
        Tool(
            name="get_meal_log",
            description="Get all meal log entries for a given date (defaults to today).",
            inputSchema={
                "type": "object",
                "properties": {
                    "user_email": {"type": "string"},
                    "date": {
                        "type": "string",
                        "description": "YYYY-MM-DD, defaults to today",
                    },
                },
                "required": ["user_email"],
            },
        ),
        Tool(
            name="get_macro_summary",
            description=(
                "Get a macro summary for a given date: total calories, protein, carbs, and fat "
                "consumed vs the user's daily targets. Defaults to today."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "user_email": {"type": "string"},
                    "date": {
                        "type": "string",
                        "description": "YYYY-MM-DD, defaults to today",
                    },
                },
                "required": ["user_email"],
            },
        ),
        Tool(
            name="get_inventory",
            description="Get all current inventory items for a user, optionally filtered by category.",
            inputSchema={
                "type": "object",
                "properties": {
                    "user_email": {"type": "string"},
                    "category": {
                        "type": "string",
                        "enum": ["protein", "carbs", "veggies", "dairy", "spices", "fats", "other"],
                        "description": "Optional category filter",
                    },
                },
                "required": ["user_email"],
            },
        ),
        Tool(
            name="add_inventory_item",
            description=(
                "Add a food item to the user's home inventory. "
                "unit should be one of: g, kg, pieces, tbsp, cups, L, ml, cans. "
                "category should be one of: protein, carbs, veggies, dairy, spices, fats, other."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "user_email": {"type": "string"},
                    "name": {"type": "string"},
                    "quantity": {"description": "numeric"},
                    "unit": {
                        "type": "string",
                        "enum": ["g", "kg", "pieces", "tbsp", "cups", "L", "ml", "cans"],
                    },
                    "category": {
                        "type": "string",
                        "enum": ["protein", "carbs", "veggies", "dairy", "spices", "fats", "other"],
                    },
                },
                "required": ["user_email", "name", "quantity", "unit", "category"],
            },
        ),
        Tool(
            name="update_inventory_item",
            description="Update the quantity (or other fields) of an existing inventory item by ID.",
            inputSchema={
                "type": "object",
                "properties": {
                    "user_email": {"type": "string"},
                    "item_id": {"description": "numeric"},
                    "name": {"type": "string"},
                    "quantity": {"description": "numeric"},
                    "unit": {"type": "string"},
                    "category": {"type": "string"},
                },
                "required": ["user_email", "item_id"],
            },
        ),
        Tool(
            name="delete_inventory_item",
            description="Remove an item from the user's inventory by ID.",
            inputSchema={
                "type": "object",
                "properties": {
                    "user_email": {"type": "string"},
                    "item_id": {"description": "numeric"},
                },
                "required": ["user_email", "item_id"],
            },
        ),
        Tool(
            name="log_workout",
            description=(
                "Log a completed workout session with a full exercise breakdown. "
                "workout_type: crossfit, running, football, yoga, cycling, stretch, "
                "swimming, hiit, walking, boxing, pilates, climbing, trx, strength, other. "
                "intensity: light, moderate, intense. "
                "name: optional short title for the session (e.g. 'Push Day'). "
                "exercises: list of exercises, each with `name` and a `sets` array where "
                "every set carries reps, weight_kg, optional rpe (1-10), unit and notes — "
                "this drives the per-set breakdown shown in workout history. "
                "energy_level: 1-10 scale."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "user_email": {"type": "string"},
                    "workout_type": {"type": "string"},
                    "name": {"type": "string", "description": "Optional session title, e.g. 'Push Day'"},
                    "duration_minutes": {"description": "numeric"},
                    "intensity": {"type": "string", "enum": ["light", "moderate", "intense"]},
                    "description": {"type": "string"},
                    "exercises": {
                        "type": "array",
                        "items": {"type": "object"},
                        "description": (
                            "Preferred (per-set): "
                            '[{"name": "Bench Press", "sets": [{"reps": 8, "weight_kg": 60, "rpe": 8, "unit": "kg", "notes": ""}]}]. '
                            'Shorthand also accepted: [{"name": "Pull-ups", "sets": 4, "reps": 8, "weight_kg": 0}].'
                        ),
                    },
                    "calories_burned_est": {"description": "numeric"},
                    "energy_level": { "minimum": 1, "maximum": 10},
                    "date": {"type": "string", "description": "YYYY-MM-DD, defaults to today"},
                },
                "required": ["user_email", "workout_type", "duration_minutes", "intensity"],
            },
        ),
        Tool(
            name="get_workouts",
            description="Get workout history for the last N days (default 30).",
            inputSchema={
                "type": "object",
                "properties": {
                    "user_email": {"type": "string"},
                    "days": { "default": 30},
                },
                "required": ["user_email"],
            },
        ),
        Tool(
            name="get_workout_stats",
            description="Get workout stats for this week and this month: count, total minutes, calories, types.",
            inputSchema={
                "type": "object",
                "properties": {
                    "user_email": {"type": "string"},
                },
                "required": ["user_email"],
            },
        ),
        Tool(
            name="log_expense",
            description=(
                "Log a budget expense. "
                "category: food, transport, uni, health, entertainment, shopping, other."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "user_email": {"type": "string"},
                    "amount": {"description": "numeric"},
                    "category": {
                        "type": "string",
                        "enum": ["food", "transport", "uni", "health", "entertainment", "shopping", "other"],
                    },
                    "description": {"type": "string"},
                    "date": {"type": "string", "description": "YYYY-MM-DD, defaults to today"},
                },
                "required": ["user_email", "amount", "category"],
            },
        ),
        Tool(
            name="get_expenses",
            description="Get budget entries for a period: 'week', 'month', or a number of days as string.",
            inputSchema={
                "type": "object",
                "properties": {
                    "user_email": {"type": "string"},
                    "period": {
                        "type": "string",
                        "description": "'week', 'month', or number of days e.g. '14'",
                        "default": "week",
                    },
                },
                "required": ["user_email"],
            },
        ),
        Tool(
            name="get_budget_summary",
            description="Get aggregated budget stats: this week, last week, this month, broken down by category.",
            inputSchema={
                "type": "object",
                "properties": {
                    "user_email": {"type": "string"},
                },
                "required": ["user_email"],
            },
        ),
        Tool(
            name="delete_meal_log",
            description="Delete a meal log entry by its ID.",
            inputSchema={
                "type": "object",
                "properties": {
                    "user_email": {"type": "string"},
                    "log_id": {"description": "numeric ID of the meal log entry"},
                },
                "required": ["user_email", "log_id"],
            },
        ),
        Tool(
            name="get_expiring_inventory",
            description=(
                "Get inventory items that are expiring within a given number of days (default 3). "
                "Returns items sorted by expiry_date ascending."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "user_email": {"type": "string"},
                    "within_days": {
                        "description": "numeric, default 3 — items expiring within this many days",
                        "default": 3,
                    },
                },
                "required": ["user_email"],
            },
        ),
        Tool(
            name="log_body_weight",
            description="Log a body weight measurement for the user.",
            inputSchema={
                "type": "object",
                "properties": {
                    "user_email": {"type": "string"},
                    "weight_kg": {"description": "numeric, weight in kg"},
                    "date": {"type": "string", "description": "YYYY-MM-DD, defaults to today"},
                    "notes": {"type": "string"},
                },
                "required": ["user_email", "weight_kg"],
            },
        ),
        Tool(
            name="get_body_weight_history",
            description="Get body weight log entries for the last N days (default 90).",
            inputSchema={
                "type": "object",
                "properties": {
                    "user_email": {"type": "string"},
                    "days": {"description": "numeric, default 90"},
                },
                "required": ["user_email"],
            },
        ),
        Tool(
            name="get_workout_templates",
            description="Get saved workout templates for a user.",
            inputSchema={
                "type": "object",
                "properties": {
                    "user_email": {"type": "string"},
                    "workout_type": {
                        "type": "string",
                        "description": "Optional filter: crossfit, running, cycling, hyrox, strength, other",
                    },
                },
                "required": ["user_email"],
            },
        ),
        Tool(
            name="add_workout_template",
            description=(
                "Create a new workout template. "
                "exercises is a list of objects with: name, sets, reps, rest_seconds, notes."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "user_email": {"type": "string"},
                    "name": {"type": "string"},
                    "workout_type": {"type": "string"},
                    "estimated_duration": {"description": "numeric minutes"},
                    "description": {"type": "string"},
                    "exercises": {
                        "type": "array",
                        "items": {"type": "object"},
                        "description": '[{"name": "Pull-ups", "sets": 4, "reps": 8, "rest_seconds": 90}]',
                    },
                },
                "required": ["user_email", "name", "workout_type", "exercises"],
            },
        ),
        Tool(
            name="get_analytics_summary",
            description=(
                "Get a comprehensive analytics summary for a user: "
                "body weight trend, workout frequency heatmap (last 90 days), "
                "personal records (PRs), and macro adherence stats."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "user_email": {"type": "string"},
                    "days": {"description": "numeric, lookback window, default 90"},
                },
                "required": ["user_email"],
            },
        ),
        Tool(
            name="update_supplements",
            description=(
                "Replace the user's supplement list. "
                "supplements is an object with keys: morning, pre_workout, post_workout, before_bed — "
                "each a list of supplement name strings."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "user_email": {"type": "string"},
                    "supplements": {
                        "type": "object",
                        "description": '{"morning": ["Vitamin D", "Omega-3"], "post_workout": ["Whey Protein", "Creatine"]}',
                    },
                },
                "required": ["user_email", "supplements"],
            },
        ),
        Tool(
            name="get_personal_records",
            description="Get the user's strength personal records (PRs): exercise, weight, reps, date, estimated 1RM.",
            inputSchema={
                "type": "object",
                "properties": {
                    "user_email": {"type": "string"},
                },
                "required": ["user_email"],
            },
        ),
        Tool(
            name="upsert_personal_record",
            description=(
                "Record a strength PR for an exercise. Only updates if the new weight "
                "beats the stored record for that exercise."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "user_email": {"type": "string"},
                    "exercise_name": {"type": "string"},
                    "weight_kg": {"description": "numeric"},
                    "reps": {"description": "numeric"},
                    "date": {"type": "string", "description": "YYYY-MM-DD, defaults to today"},
                    "notes": {"type": "string"},
                },
                "required": ["user_email", "exercise_name", "weight_kg", "reps"],
            },
        ),
    ]


# ---- Tool handlers ----

@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        try:
            result = await _dispatch(name, arguments, conn)
            return [TextContent(type="text", text=json.dumps(result, default=str, indent=2))]
        except ValueError as e:
            return [TextContent(type="text", text=f"Error: {e}")]
        except Exception as e:
            return [TextContent(type="text", text=f"Unexpected error: {e}")]


async def _dispatch(name: str, args: dict, conn: asyncpg.Connection) -> Any:
    email = args["user_email"]
    user_id = await resolve_user_id(conn, email)

    if name == "get_profile":
        return await _get_profile(conn, user_id)

    if name == "update_profile":
        return await _update_profile(conn, user_id, args)

    if name == "get_schedule":
        return await _get_schedule(conn, user_id, args)

    if name == "add_schedule_event":
        return await _add_schedule_event(conn, user_id, args)

    if name == "update_schedule_event":
        return await _update_schedule_event(conn, user_id, args)

    if name == "delete_schedule_event":
        return await _delete_schedule_event(conn, user_id, args)

    if name == "get_meal_templates":
        return await _get_meal_templates(conn, user_id, args)

    if name == "add_meal_template":
        return await _add_meal_template(conn, user_id, args)

    if name == "update_meal_template":
        return await _update_meal_template(conn, user_id, args)

    if name == "log_meal":
        return await _log_meal(conn, user_id, args)

    if name == "get_meal_log":
        return await _get_meal_log(conn, user_id, args)

    if name == "get_macro_summary":
        return await _get_macro_summary(conn, user_id, args)

    if name == "get_inventory":
        return await _get_inventory(conn, user_id, args)

    if name == "add_inventory_item":
        return await _add_inventory_item(conn, user_id, args)

    if name == "update_inventory_item":
        return await _update_inventory_item(conn, user_id, args)

    if name == "delete_inventory_item":
        return await _delete_inventory_item(conn, user_id, args)

    if name == "log_workout":
        return await _log_workout(conn, user_id, args)

    if name == "get_workouts":
        return await _get_workouts(conn, user_id, args)

    if name == "get_workout_stats":
        return await _get_workout_stats(conn, user_id, args)

    if name == "log_expense":
        return await _log_expense(conn, user_id, args)

    if name == "get_expenses":
        return await _get_expenses(conn, user_id, args)

    if name == "get_budget_summary":
        return await _get_budget_summary(conn, user_id, args)

    if name == "delete_meal_log":
        return await _delete_meal_log(conn, user_id, args)

    if name == "get_expiring_inventory":
        return await _get_expiring_inventory(conn, user_id, args)

    if name == "log_body_weight":
        return await _log_body_weight(conn, user_id, args)

    if name == "get_body_weight_history":
        return await _get_body_weight_history(conn, user_id, args)

    if name == "get_workout_templates":
        return await _get_workout_templates(conn, user_id, args)

    if name == "add_workout_template":
        return await _add_workout_template(conn, user_id, args)

    if name == "get_analytics_summary":
        return await _get_analytics_summary(conn, user_id, args)

    if name == "update_supplements":
        return await _update_supplements(conn, user_id, args)

    if name == "get_personal_records":
        return await _get_personal_records(conn, user_id)

    if name == "upsert_personal_record":
        return await _upsert_personal_record(conn, user_id, args)

    raise ValueError(f"Unknown tool: {name}")


# ---- Type coercion helpers (MCP clients often send numbers as strings) ----

def _i(val, default=None) -> Optional[int]:
    """I safely cast any value to int."""
    if val is None:
        return default
    try:
        return int(float(val))
    except (TypeError, ValueError):
        return default


def _f(val, default=None) -> Optional[float]:
    """I safely cast any value to float."""
    if val is None:
        return default
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


def _normalize_workout_exercises(raw) -> list:
    """I store a structured set-by-set breakdown so the app's history detail
    screen can render exercises, sets, reps, weight, unit and notes.

    I accept either the rich form ``{"name", "sets": [{"reps","weight_kg",...}]}``
    or the shorthand ``{"name", "sets": 4, "reps": 8, "weight_kg": 60}`` and
    always emit ``[{name, sets: [{reps, weight_kg, rpe, unit, notes}], notes}]``.
    """
    if not isinstance(raw, list):
        return []

    out = []
    for ex in raw:
        if isinstance(ex, str):
            out.append({"name": ex, "sets": [], "notes": None})
            continue
        if not isinstance(ex, dict):
            continue

        name = ex.get("name") or ex.get("exercise") or "Exercise"
        unit = ex.get("unit") or "kg"
        raw_sets = ex.get("sets")
        norm_sets = []

        if isinstance(raw_sets, list):
            for s in raw_sets:
                if not isinstance(s, dict):
                    continue
                norm_sets.append({
                    "reps":      _i(s.get("reps"), 0),
                    "weight_kg": _f(s.get("weight_kg", s.get("weight")), 0),
                    "rpe":       _i(s.get("rpe")),
                    "unit":      s.get("unit") or unit,
                    "isWarmup":  bool(s.get("isWarmup", False)),
                    "notes":     s.get("notes"),
                })
        elif isinstance(raw_sets, (int, float)) and raw_sets:
            reps = _i(ex.get("reps"), 0)
            weight = _f(ex.get("weight_kg", ex.get("weight")), 0)
            for _ in range(int(raw_sets)):
                norm_sets.append({
                    "reps": reps, "weight_kg": weight, "rpe": None,
                    "unit": unit, "isWarmup": False, "notes": None,
                })
        elif ex.get("reps") is not None or ex.get("weight_kg") is not None:
            norm_sets.append({
                "reps":      _i(ex.get("reps"), 0),
                "weight_kg": _f(ex.get("weight_kg", ex.get("weight")), 0),
                "rpe":       _i(ex.get("rpe")),
                "unit":      unit,
                "isWarmup":  False,
                "notes":     ex.get("notes"),
            })

        out.append({"name": name, "sets": norm_sets, "notes": ex.get("notes")})
    return out


# ---- Tool implementations ----

async def _get_profile(conn: asyncpg.Connection, user_id: int) -> dict:
    row = await conn.fetchrow(
        """
        SELECT username, email, current_weight_kg, target_weight_kg, height_cm,
               age, gender, daily_calorie_target, daily_protein_target,
               daily_carb_target, daily_fat_target, preferred_currency,
               dietary_preferences, supplements, routine_preferences,
               grocery_stores, created_at
        FROM users WHERE id = $1
        """,
        user_id,
    )
    return _serialize(row)


async def _update_profile(conn: asyncpg.Connection, user_id: int, args: dict) -> dict:
    # I build the SET clause dynamically from whichever fields were provided
    simple_fields = [
        "current_weight_kg", "target_weight_kg", "height_cm", "age", "gender",
        "daily_calorie_target", "daily_protein_target", "daily_carb_target",
        "daily_fat_target",
    ]
    json_fields = ["dietary_preferences", "supplements", "routine_preferences"]

    updates = []
    values = []
    idx = 1

    float_fields = {"current_weight_kg", "target_weight_kg", "height_cm"}
    int_fields = {"age", "daily_calorie_target", "daily_protein_target", "daily_carb_target", "daily_fat_target"}
    for field in simple_fields:
        if field in args and args[field] is not None:
            updates.append(f"{field} = ${idx}")
            if field in float_fields:
                values.append(_f(args[field]))
            elif field in int_fields:
                values.append(_i(args[field]))
            else:
                values.append(args[field])
            idx += 1

    for field in json_fields:
        if field in args and args[field] is not None:
            updates.append(f"{field} = ${idx}::jsonb")
            values.append(json.dumps(args[field]))
            idx += 1

    if not updates:
        return {"status": "no_changes", "message": "No updatable fields provided."}

    updates.append(f"updated_at = now()")
    values.append(user_id)

    await conn.execute(
        f"UPDATE users SET {', '.join(updates)} WHERE id = ${idx}",
        *values,
    )
    return {"status": "updated", "fields": [u.split(" =")[0] for u in updates[:-1]]}


async def _get_schedule(conn: asyncpg.Connection, user_id: int, args: dict) -> dict:
    day = args.get("day_of_week")
    target_date_str = args.get("target_date")

    base = """
        SELECT id, title, description, event_type, day_of_week, start_time, end_time,
               location, recurrence, specific_date, event_data, is_user_modified
        FROM schedule_events
        WHERE user_id = $1 AND is_active = true
    """
    params: list[Any] = [user_id]

    if day is not None:
        base += f" AND day_of_week = ${len(params) + 1}"
        params.append(day)
    elif target_date_str:
        parsed = date_cls.fromisoformat(target_date_str)
        weekday = parsed.weekday()
        base += f" AND (day_of_week = ${len(params) + 1} OR date(specific_date) = ${len(params) + 2})"
        params.extend([weekday, parsed])

    base += " ORDER BY day_of_week NULLS LAST, start_time"
    rows = await conn.fetch(base, *params)
    return {"events": [_serialize(r) for r in rows], "count": len(rows)}


async def _add_schedule_event(conn: asyncpg.Connection, user_id: int, args: dict) -> dict:
    specific_date = None
    if args.get("specific_date"):
        specific_date = date_cls.fromisoformat(args["specific_date"])

    # I convert time strings to datetime.time objects because asyncpg requires
    # proper time instances, not raw strings, even with ::time casts in the query.
    start_time = _parse_time(args["start_time"])
    end_time = _parse_time(args["end_time"])

    row = await conn.fetchrow(
        """
        INSERT INTO schedule_events
            (user_id, title, description, event_type, day_of_week, start_time, end_time,
             location, recurrence, specific_date, event_data, is_active)
        VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, true)
        RETURNING id, title, event_type, day_of_week, start_time, end_time
        """,
        user_id,
        args["title"],
        args.get("description"),
        args["event_type"].upper(),
        _i(args.get("day_of_week")),
        start_time,
        end_time,
        args.get("location"),
        args.get("recurrence", "weekly"),
        specific_date,
        json.dumps(args.get("event_data", {})),
    )
    return {"status": "created", "event": _serialize(row)}


async def _update_schedule_event(conn: asyncpg.Connection, user_id: int, args: dict) -> dict:
    event_id = _i(args["event_id"])

    # I verify ownership first
    exists = await conn.fetchval(
        "SELECT id FROM schedule_events WHERE id = $1 AND user_id = $2 AND is_active = true",
        event_id, user_id,
    )
    if not exists:
        raise ValueError(f"Event {event_id} not found or does not belong to this user.")

    field_map = {
        "title": ("title", "text"),
        "description": ("description", "text"),
        "location": ("location", "text"),
        "day_of_week": ("day_of_week", "int"),
        "is_active": ("is_active", "bool"),
    }
    time_fields = {"start_time", "end_time"}
    json_fields = {"event_data"}

    updates = []
    values = []
    idx = 1

    for arg_key, (col, _) in field_map.items():
        if arg_key in args and args[arg_key] is not None:
            updates.append(f"{col} = ${idx}")
            values.append(args[arg_key])
            idx += 1

    for tf in time_fields:
        if tf in args and args[tf]:
            updates.append(f"{tf} = ${idx}")
            values.append(_parse_time(args[tf]))
            idx += 1

    for jf in json_fields:
        if jf in args and args[jf] is not None:
            updates.append(f"{jf} = ${idx}::jsonb")
            values.append(json.dumps(args[jf]))
            idx += 1

    if updates:
        updates.append("is_user_modified = true")
        updates.append("updated_at = now()")
        values.append(event_id)
        await conn.execute(
            f"UPDATE schedule_events SET {', '.join(updates)} WHERE id = ${idx}",
            *values,
        )

    # I log the modification so the RAG system can learn from it
    if args.get("reason") or updates:
        await conn.execute(
            """
            INSERT INTO schedule_modifications (user_id, event_id, modification_type, reason)
            VALUES ($1, $2, 'update', $3)
            """,
            user_id, event_id, args.get("reason"),
        )

    return {"status": "updated", "event_id": event_id}


async def _delete_schedule_event(conn: asyncpg.Connection, user_id: int, args: dict) -> dict:
    event_id = _i(args["event_id"])
    result = await conn.execute(
        "UPDATE schedule_events SET is_active = false, updated_at = now() WHERE id = $1 AND user_id = $2",
        event_id, user_id,
    )
    if result == "UPDATE 0":
        raise ValueError(f"Event {event_id} not found or does not belong to this user.")

    await conn.execute(
        """
        INSERT INTO schedule_modifications (user_id, event_id, modification_type, reason)
        VALUES ($1, $2, 'skip', $3)
        """,
        user_id, event_id, args.get("reason"),
    )
    return {"status": "deleted", "event_id": event_id}


async def _get_meal_templates(conn: asyncpg.Connection, user_id: int, args: dict) -> dict:
    meal_type = args.get("meal_type")
    if meal_type:
        rows = await conn.fetch(
            """
            SELECT id, name, meal_type, calories, protein_g, carbs_g, fat_g, fiber_g,
                   ingredients, prep_instructions, prep_time_minutes, source
            FROM meal_templates
            WHERE user_id = $1 AND is_active = true AND meal_type = $2
            ORDER BY name
            """,
            user_id, meal_type,
        )
    else:
        rows = await conn.fetch(
            """
            SELECT id, name, meal_type, calories, protein_g, carbs_g, fat_g, fiber_g,
                   ingredients, prep_instructions, prep_time_minutes, source
            FROM meal_templates
            WHERE user_id = $1 AND is_active = true
            ORDER BY meal_type, name
            """,
            user_id,
        )
    return {"templates": [_serialize(r) for r in rows], "count": len(rows)}


async def _add_meal_template(conn: asyncpg.Connection, user_id: int, args: dict) -> dict:
    row = await conn.fetchrow(
        """
        INSERT INTO meal_templates
            (user_id, name, meal_type, calories, protein_g, carbs_g, fat_g, fiber_g,
             ingredients, prep_instructions, prep_time_minutes, source, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, 'user', true)
        RETURNING id, name, meal_type, calories, protein_g
        """,
        user_id,
        args["name"],
        args["meal_type"],
        _f(args["calories"]),
        _f(args["protein_g"]),
        _f(args.get("carbs_g")),
        _f(args.get("fat_g")),
        _f(args.get("fiber_g")),
        json.dumps(args["ingredients"]),
        args.get("prep_instructions"),
        _i(args.get("prep_time_minutes")),
    )
    return {"status": "created", "template": _serialize(row)}


async def _update_meal_template(conn: asyncpg.Connection, user_id: int, args: dict) -> dict:
    template_id = _i(args["template_id"])
    exists = await conn.fetchval(
        "SELECT id FROM meal_templates WHERE id = $1 AND user_id = $2",
        template_id, user_id,
    )
    if not exists:
        raise ValueError(f"Template {template_id} not found or does not belong to this user.")

    simple_cols = ["name", "calories", "protein_g", "carbs_g", "fat_g", "fiber_g",
                   "prep_instructions", "prep_time_minutes", "is_active"]
    updates = []
    values = []
    idx = 1

    for col in simple_cols:
        if col in args and args[col] is not None:
            updates.append(f"{col} = ${idx}")
            values.append(args[col])
            idx += 1

    if "ingredients" in args and args["ingredients"] is not None:
        updates.append(f"ingredients = ${idx}::jsonb")
        values.append(json.dumps(args["ingredients"]))
        idx += 1

    if not updates:
        return {"status": "no_changes"}

    values.append(template_id)
    await conn.execute(
        f"UPDATE meal_templates SET {', '.join(updates)} WHERE id = ${idx}",
        *values,
    )
    return {"status": "updated", "template_id": template_id}


async def _log_meal(conn: asyncpg.Connection, user_id: int, args: dict) -> dict:
    log_date = date_cls.fromisoformat(args["date"]) if args.get("date") else date_cls.today()
    row = await conn.fetchrow(
        """
        INSERT INTO meal_logs
            (user_id, date, meal_type, name, calories, protein_g, carbs_g, fat_g,
             template_id, custom_ingredients, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
        RETURNING id, name, meal_type, calories, protein_g, date
        """,
        user_id,
        log_date,
        args["meal_type"],
        args["name"],
        _f(args["calories"]),
        _f(args["protein_g"]),
        _f(args.get("carbs_g")),
        _f(args.get("fat_g")),
        _i(args.get("template_id")),
        json.dumps(args.get("custom_ingredients")) if args.get("custom_ingredients") else None,
        args.get("notes"),
    )
    return {"status": "logged", "entry": _serialize(row)}


async def _get_meal_log(conn: asyncpg.Connection, user_id: int, args: dict) -> dict:
    log_date = date_cls.fromisoformat(args["date"]) if args.get("date") else date_cls.today()
    rows = await conn.fetch(
        """
        SELECT id, meal_type, name, calories, protein_g, carbs_g, fat_g, notes, created_at
        FROM meal_logs
        WHERE user_id = $1 AND date = $2
        ORDER BY created_at
        """,
        user_id, log_date,
    )
    return {"date": str(log_date), "entries": [_serialize(r) for r in rows], "count": len(rows)}


async def _get_macro_summary(conn: asyncpg.Connection, user_id: int, args: dict) -> dict:
    log_date = date_cls.fromisoformat(args["date"]) if args.get("date") else date_cls.today()

    totals = await conn.fetchrow(
        """
        SELECT
            COALESCE(SUM(calories), 0)   AS total_calories,
            COALESCE(SUM(protein_g), 0)  AS total_protein,
            COALESCE(SUM(carbs_g), 0)    AS total_carbs,
            COALESCE(SUM(fat_g), 0)      AS total_fat
        FROM meal_logs
        WHERE user_id = $1 AND date = $2
        """,
        user_id, log_date,
    )
    targets = await conn.fetchrow(
        """
        SELECT daily_calorie_target, daily_protein_target,
               daily_carb_target, daily_fat_target
        FROM users WHERE id = $1
        """,
        user_id,
    )

    def _remaining(consumed: float, target: Optional[int]) -> Optional[float]:
        return round(target - consumed, 1) if target else None

    cal = float(totals["total_calories"])
    prot = float(totals["total_protein"])
    carbs = float(totals["total_carbs"])
    fat = float(totals["total_fat"])

    return {
        "date": str(log_date),
        "consumed": {
            "calories": round(cal, 1),
            "protein_g": round(prot, 1),
            "carbs_g": round(carbs, 1),
            "fat_g": round(fat, 1),
        },
        "targets": {
            "calories": targets["daily_calorie_target"],
            "protein_g": targets["daily_protein_target"],
            "carbs_g": targets["daily_carb_target"],
            "fat_g": targets["daily_fat_target"],
        },
        "remaining": {
            "calories": _remaining(cal, targets["daily_calorie_target"]),
            "protein_g": _remaining(prot, targets["daily_protein_target"]),
            "carbs_g": _remaining(carbs, targets["daily_carb_target"]),
            "fat_g": _remaining(fat, targets["daily_fat_target"]),
        },
    }


async def _log_workout(conn: asyncpg.Connection, user_id: int, args: dict) -> dict:
    log_date = date_cls.fromisoformat(args["date"]) if args.get("date") else date_cls.today()
    details = {}
    if args.get("name"):
        details["name"] = args["name"]
    if args.get("exercises"):
        normalized = _normalize_workout_exercises(args["exercises"])
        if normalized:
            details["exercises"] = normalized
            details["total_volume_kg"] = round(sum(
                (s.get("weight_kg") or 0) * (s.get("reps") or 0)
                for ex in normalized for s in ex["sets"]
            ))

    row = await conn.fetchrow(
        """
        INSERT INTO workout_logs
            (user_id, date, workout_type, duration_minutes, intensity,
             notes, details, calories_burned_est, energy_level)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
        RETURNING id, date, workout_type, duration_minutes, intensity, calories_burned_est
        """,
        user_id,
        log_date,
        args["workout_type"].lower(),
        _i(args["duration_minutes"]),
        args["intensity"],
        args.get("description"),
        json.dumps(details) if details else json.dumps({}),
        _i(args.get("calories_burned_est")),
        _i(args.get("energy_level")),
    )
    return {"status": "logged", "workout": _serialize(row)}


async def _get_workouts(conn: asyncpg.Connection, user_id: int, args: dict) -> dict:
    from datetime import timedelta
    days = _i(args.get("days", 30))
    start = date_cls.today() - timedelta(days=days)
    rows = await conn.fetch(
        """
        SELECT id, date, workout_type, duration_minutes, intensity,
               calories_burned_est, notes, energy_level, details
        FROM workout_logs
        WHERE user_id = $1 AND date >= $2
        ORDER BY date DESC
        """,
        user_id, start,
    )
    workouts = []
    for r in rows:
        w = _serialize(r)
        details = w.get("details")
        if isinstance(details, str):
            try:
                details = json.loads(details)
            except (ValueError, TypeError):
                details = None
        if isinstance(details, dict):
            w["name"] = details.get("name")
            w["exercises"] = details.get("exercises", [])
        workouts.append(w)
    return {"workouts": workouts, "total": len(workouts)}


async def _get_workout_stats(conn: asyncpg.Connection, user_id: int, args: dict) -> dict:
    from datetime import timedelta
    today = date_cls.today()
    week_start = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)

    week_rows = await conn.fetch(
        "SELECT duration_minutes, calories_burned_est, workout_type FROM workout_logs WHERE user_id=$1 AND date>=$2",
        user_id, week_start,
    )
    month_rows = await conn.fetch(
        "SELECT duration_minutes, calories_burned_est FROM workout_logs WHERE user_id=$1 AND date>=$2",
        user_id, month_start,
    )
    return {
        "this_week": {
            "count": len(week_rows),
            "total_minutes": sum(r["duration_minutes"] for r in week_rows),
            "total_calories": sum(r["calories_burned_est"] or 0 for r in week_rows),
            "types": list(set(r["workout_type"] for r in week_rows)),
        },
        "this_month": {
            "count": len(month_rows),
            "total_minutes": sum(r["duration_minutes"] for r in month_rows),
            "total_calories": sum(r["calories_burned_est"] or 0 for r in month_rows),
        },
    }


async def _log_expense(conn: asyncpg.Connection, user_id: int, args: dict) -> dict:
    log_date = date_cls.fromisoformat(args["date"]) if args.get("date") else date_cls.today()
    row = await conn.fetchrow(
        """
        INSERT INTO budget_entries (user_id, amount, category, description, date)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, amount, category, description, date
        """,
        user_id,
        round(_f(args["amount"]), 2),
        args["category"].lower(),
        args.get("description"),
        log_date,
    )
    return {"status": "logged", "entry": _serialize(row)}


async def _get_expenses(conn: asyncpg.Connection, user_id: int, args: dict) -> dict:
    from datetime import timedelta
    period = args.get("period", "week")
    today = date_cls.today()
    if period == "week":
        start = today - timedelta(days=today.weekday())
    elif period == "month":
        start = today.replace(day=1)
    else:
        start = today - timedelta(days=int(period) if str(period).isdigit() else 30)

    rows = await conn.fetch(
        """
        SELECT id, amount, category, description, date
        FROM budget_entries WHERE user_id=$1 AND date>=$2
        ORDER BY date DESC
        """,
        user_id, start,
    )
    total = round(sum(r["amount"] for r in rows), 2)
    return {"entries": [_serialize(r) for r in rows], "total": total, "period": period}


async def _get_budget_summary(conn: asyncpg.Connection, user_id: int, args: dict) -> dict:
    from datetime import timedelta
    today = date_cls.today()
    week_start = today - timedelta(days=today.weekday())
    prev_week_start = week_start - timedelta(days=7)
    month_start = today.replace(day=1)

    week_rows = await conn.fetch(
        "SELECT amount, category, date FROM budget_entries WHERE user_id=$1 AND date>=$2",
        user_id, week_start,
    )
    prev_rows = await conn.fetch(
        "SELECT amount FROM budget_entries WHERE user_id=$1 AND date>=$2 AND date<$3",
        user_id, prev_week_start, week_start,
    )
    month_rows = await conn.fetch(
        "SELECT amount FROM budget_entries WHERE user_id=$1 AND date>=$2",
        user_id, month_start,
    )

    by_category: dict = {}
    daily: dict = {}
    for r in week_rows:
        by_category[r["category"]] = round(by_category.get(r["category"], 0) + r["amount"], 2)
        d = str(r["date"])
        daily[d] = round(daily.get(d, 0) + r["amount"], 2)

    return {
        "this_week": {
            "total": round(sum(r["amount"] for r in week_rows), 2),
            "by_category": by_category,
            "daily": daily,
        },
        "last_week": {"total": round(sum(r["amount"] for r in prev_rows), 2)},
        "this_month": {"total": round(sum(r["amount"] for r in month_rows), 2)},
    }


async def _get_inventory(conn: asyncpg.Connection, user_id: int, args: dict) -> dict:
    category = args.get("category")
    if category:
        rows = await conn.fetch(
            """
            SELECT id, name, quantity, unit, category, created_at
            FROM inventory_items WHERE user_id = $1 AND category = $2
            ORDER BY category, name
            """,
            user_id, category,
        )
    else:
        rows = await conn.fetch(
            """
            SELECT id, name, quantity, unit, category, created_at
            FROM inventory_items WHERE user_id = $1
            ORDER BY category, name
            """,
            user_id,
        )
    return {"items": [_serialize(r) for r in rows], "count": len(rows)}


async def _add_inventory_item(conn: asyncpg.Connection, user_id: int, args: dict) -> dict:
    row = await conn.fetchrow(
        """
        INSERT INTO inventory_items (user_id, name, quantity, unit, category)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, name, quantity, unit, category
        """,
        user_id,
        args["name"],
        _f(args["quantity"]),
        args["unit"],
        args["category"],
    )
    return {"status": "added", "item": _serialize(row)}


async def _update_inventory_item(conn: asyncpg.Connection, user_id: int, args: dict) -> dict:
    item_id = _i(args["item_id"])
    exists = await conn.fetchval(
        "SELECT id FROM inventory_items WHERE id = $1 AND user_id = $2",
        item_id, user_id,
    )
    if not exists:
        raise ValueError(f"Inventory item {item_id} not found for this user.")

    cols = ["name", "quantity", "unit", "category"]
    updates, values = [], []
    idx = 1
    for col in cols:
        if col in args and args[col] is not None:
            updates.append(f"{col} = ${idx}")
            values.append(args[col])
            idx += 1

    if not updates:
        return {"status": "no_changes"}

    updates.append("updated_at = now()")
    values.append(item_id)
    await conn.execute(
        f"UPDATE inventory_items SET {', '.join(updates)} WHERE id = ${idx}",
        *values,
    )
    return {"status": "updated", "item_id": item_id}


async def _delete_inventory_item(conn: asyncpg.Connection, user_id: int, args: dict) -> dict:
    result = await conn.execute(
        "DELETE FROM inventory_items WHERE id = $1 AND user_id = $2",
        _i(args["item_id"]), user_id,
    )
    if result == "DELETE 0":
        raise ValueError(f"Inventory item {_i(args['item_id'])} not found for this user.")
    return {"status": "deleted", "item_id": args["item_id"]}


async def _delete_meal_log(conn: asyncpg.Connection, user_id: int, args: dict) -> dict:
    log_id = _i(args["log_id"])
    result = await conn.execute(
        "DELETE FROM meal_logs WHERE id = $1 AND user_id = $2",
        log_id, user_id,
    )
    if result == "DELETE 0":
        raise ValueError(f"Meal log {log_id} not found for this user.")
    return {"status": "deleted", "log_id": log_id}


async def _get_expiring_inventory(conn: asyncpg.Connection, user_id: int, args: dict) -> dict:
    from datetime import timedelta
    within = _i(args.get("within_days", 3))
    today = date_cls.today()
    cutoff = today + timedelta(days=within)
    rows = await conn.fetch(
        """
        SELECT id, name, quantity, unit, category, expiry_date,
               (expiry_date - CURRENT_DATE) AS days_left
        FROM inventory_items
        WHERE user_id = $1 AND expiry_date IS NOT NULL AND expiry_date <= $2
        ORDER BY expiry_date ASC
        """,
        user_id, cutoff,
    )
    return {"items": [_serialize(r) for r in rows], "count": len(rows), "within_days": within}


async def _log_body_weight(conn: asyncpg.Connection, user_id: int, args: dict) -> dict:
    log_date = date_cls.fromisoformat(args["date"]) if args.get("date") else date_cls.today()
    weight = _f(args["weight_kg"])
    # Upsert: one entry per day per user
    row = await conn.fetchrow(
        """
        INSERT INTO weight_logs (user_id, date, weight_kg, notes)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, date) DO UPDATE
            SET weight_kg = EXCLUDED.weight_kg, notes = EXCLUDED.notes
        RETURNING id, date, weight_kg
        """,
        user_id, log_date, weight, args.get("notes"),
    )
    # Also update current_weight_kg in profile
    await conn.execute(
        "UPDATE users SET current_weight_kg = $1, updated_at = now() WHERE id = $2",
        weight, user_id,
    )
    return {"status": "logged", "entry": _serialize(row)}


async def _get_body_weight_history(conn: asyncpg.Connection, user_id: int, args: dict) -> dict:
    from datetime import timedelta
    days = _i(args.get("days", 90))
    start = date_cls.today() - timedelta(days=days)
    rows = await conn.fetch(
        """
        SELECT date, weight_kg, notes
        FROM weight_logs
        WHERE user_id = $1 AND date >= $2
        ORDER BY date ASC
        """,
        user_id, start,
    )
    data = [_serialize(r) for r in rows]
    weights = [r["weight_kg"] for r in data if r["weight_kg"]]
    return {
        "entries": data,
        "count": len(data),
        "min_kg": min(weights) if weights else None,
        "max_kg": max(weights) if weights else None,
        "delta_kg": round(weights[-1] - weights[0], 2) if len(weights) >= 2 else None,
    }


async def _get_workout_templates(conn: asyncpg.Connection, user_id: int, args: dict) -> dict:
    workout_type = args.get("workout_type")
    if workout_type:
        rows = await conn.fetch(
            """
            SELECT id, name, workout_type, estimated_duration, description, exercises
            FROM workout_templates
            WHERE user_id = $1 AND workout_type = $2
            ORDER BY name
            """,
            user_id, workout_type.lower(),
        )
    else:
        rows = await conn.fetch(
            """
            SELECT id, name, workout_type, estimated_duration, description, exercises
            FROM workout_templates
            WHERE user_id = $1
            ORDER BY workout_type, name
            """,
            user_id,
        )
    return {"templates": [_serialize(r) for r in rows], "count": len(rows)}


async def _add_workout_template(conn: asyncpg.Connection, user_id: int, args: dict) -> dict:
    row = await conn.fetchrow(
        """
        INSERT INTO workout_templates
            (user_id, name, workout_type, estimated_duration, description, exercises)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        RETURNING id, name, workout_type, estimated_duration
        """,
        user_id,
        args["name"],
        args["workout_type"].lower(),
        _i(args.get("estimated_duration")),
        args.get("description"),
        json.dumps(args.get("exercises", [])),
    )
    return {"status": "created", "template": _serialize(row)}


async def _get_analytics_summary(conn: asyncpg.Connection, user_id: int, args: dict) -> dict:
    from datetime import timedelta
    days = _i(args.get("days", 90))
    start = date_cls.today() - timedelta(days=days)

    # Body weight trend
    weight_rows = await conn.fetch(
        "SELECT date, weight_kg FROM weight_logs WHERE user_id=$1 AND date>=$2 ORDER BY date",
        user_id, start,
    )

    # Workout frequency (dates)
    workout_rows = await conn.fetch(
        "SELECT date, workout_type, duration_minutes, calories_burned_est FROM workout_logs WHERE user_id=$1 AND date>=$2 ORDER BY date",
        user_id, start,
    )

    # Macro adherence (last 7 days)
    week_start = date_cls.today() - timedelta(days=7)
    macro_rows = await conn.fetch(
        """
        SELECT date,
               SUM(calories) AS cal, SUM(protein_g) AS prot,
               SUM(carbs_g) AS carbs, SUM(fat_g) AS fat
        FROM meal_logs WHERE user_id=$1 AND date>=$2
        GROUP BY date ORDER BY date
        """,
        user_id, week_start,
    )

    targets = await conn.fetchrow(
        "SELECT daily_calorie_target, daily_protein_target FROM users WHERE id=$1",
        user_id,
    )

    workout_count = len(workout_rows)
    total_minutes = sum(r["duration_minutes"] or 0 for r in workout_rows)
    by_type: dict = {}
    for r in workout_rows:
        t = r["workout_type"]
        by_type[t] = by_type.get(t, 0) + 1

    return {
        "body_weight": [_serialize(r) for r in weight_rows],
        "workouts": {
            "count": workout_count,
            "total_minutes": total_minutes,
            "by_type": by_type,
            "dates": [str(r["date"]) for r in workout_rows],
        },
        "macro_adherence": [_serialize(r) for r in macro_rows],
        "targets": _serialize(targets),
        "period_days": days,
    }


async def _update_supplements(conn: asyncpg.Connection, user_id: int, args: dict) -> dict:
    supplements = args["supplements"]
    await conn.execute(
        "UPDATE users SET supplements = $1::jsonb, updated_at = now() WHERE id = $2",
        json.dumps(supplements), user_id,
    )
    return {"status": "updated", "supplements": supplements}


async def _get_personal_records(conn: asyncpg.Connection, user_id: int) -> dict:
    rows = await conn.fetch(
        """
        SELECT exercise_name, weight_kg, reps, date, notes
        FROM personal_records WHERE user_id = $1
        ORDER BY weight_kg DESC
        """,
        user_id,
    )
    prs = []
    for r in rows:
        d = _serialize(r)
        reps = r["reps"] or 1
        d["estimated_1rm_kg"] = round(r["weight_kg"] * (1 + reps / 30)) if reps > 1 else r["weight_kg"]
        prs.append(d)
    return {"personal_records": prs, "total": len(prs)}


async def _upsert_personal_record(conn: asyncpg.Connection, user_id: int, args: dict) -> dict:
    pr_date = date_cls.fromisoformat(args["date"]) if args.get("date") else date_cls.today()
    weight = _f(args["weight_kg"])
    reps = _i(args["reps"])
    existing = await conn.fetchrow(
        "SELECT id, weight_kg FROM personal_records WHERE user_id=$1 AND exercise_name=$2",
        user_id, args["exercise_name"],
    )
    if existing:
        if weight <= existing["weight_kg"]:
            return {"status": "kept_existing", "current_record_kg": existing["weight_kg"]}
        await conn.execute(
            "UPDATE personal_records SET weight_kg=$1, reps=$2, date=$3, notes=COALESCE($4, notes) WHERE id=$5",
            weight, reps, pr_date, args.get("notes"), existing["id"],
        )
        return {"status": "updated", "exercise_name": args["exercise_name"], "weight_kg": weight, "reps": reps}
    await conn.execute(
        """
        INSERT INTO personal_records (user_id, exercise_name, weight_kg, reps, date, notes)
        VALUES ($1, $2, $3, $4, $5, $6)
        """,
        user_id, args["exercise_name"], weight, reps, pr_date, args.get("notes"),
    )
    return {"status": "created", "exercise_name": args["exercise_name"], "weight_kg": weight, "reps": reps}


# ---- Starlette ASGI app with SSE transport ----

def build_app() -> Starlette:
    # I use the full /mcp/messages/ path so Claude's app knows the correct POST URL
    # when connecting through the Caddy reverse proxy at loadedout.online/mcp/*
    sse = SseServerTransport("/mcp/messages/")

    async def handle_sse(request: Request) -> Response:
        async with sse.connect_sse(
            request.scope, request.receive, request._send
        ) as streams:
            await server.run(
                streams[0], streams[1], server.create_initialization_options()
            )
        return Response()

    return Starlette(
        routes=[
            Route("/mcp/sse", endpoint=handle_sse),
            Mount("/mcp/messages/", app=sse.handle_post_message),
        ]
    )


if __name__ == "__main__":
    port = int(os.environ.get("MCP_PORT", "8003"))
    app = build_app()
    uvicorn.run(app, host="0.0.0.0", port=port)
