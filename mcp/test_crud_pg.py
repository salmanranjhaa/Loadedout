"""
Every MCP add / read / update / delete, run through the real dispatcher against
a Postgres migrated to head. Never point it at the live database: it creates
users and rows freely.

  MCP_DATABASE_URL=postgresql://user:pw@host/db python test_crud_pg.py
"""

import asyncio
import json
from datetime import date, timedelta

import asyncpg

import server


async def main():
    conn = await asyncpg.connect(server.DATABASE_URL)
    uid = await conn.fetchval(
        "INSERT INTO users (username, email, hashed_password) VALUES ('crud', 'crud@test.invalid', 'x') RETURNING id")
    other = await conn.fetchval(
        "INSERT INTO users (username, email, hashed_password) VALUES ('other', 'other@test.invalid', 'x') RETURNING id")

    async def call(tool, /, user=uid, **args):
        return await server._dispatch(tool, args, conn, user)

    async def refused(tool, /, user=uid, **args):
        try:
            await server._dispatch(tool, args, conn, user)
        except ValueError as e:
            return str(e)
        raise AssertionError(f"{tool} {args} should have been refused")

    today, yesterday = str(date.today()), str(date.today() - timedelta(days=1))

    # ---- budget
    e = (await call("log_expense", amount=20, category="food", payment_method="card", description="Takeaway"))["entry"]
    await call("update_expense", expense_id=e["id"], amount="25.5", description="Takeaway (Fri)")
    row = (await call("get_expenses", period="month"))["entries"][0]
    assert (row["amount"], row["payment_method"], row["description"]) == (25.5, "card", "Takeaway (Fri)"), row
    await call("update_expense", expense_id=e["id"], category="income")
    assert (await call("get_expenses", period="month"))["entries"][0]["payment_method"] == "cash"
    await refused("update_expense", expense_id=e["id"], amount=0)
    await refused("delete_expense", user=other, expense_id=e["id"])          # not theirs
    await call("delete_expense", expense_id=e["id"])
    assert (await call("get_expenses", period="month"))["entries"] == []
    print("  PASS budget: add, read, update (card -> cash for income), delete, owner only")

    # ---- meals
    m = (await call("log_meal", meal_type="lunch", name="Rice bowl", calories=650, protein_g=45))["entry"]
    await call("update_meal_log", log_id=m["id"], name="Rice bowl (large)", calories=800, notes="extra rice")
    got = (await call("get_meal_log"))["entries"][0]
    assert (got["name"], got["calories"], got["notes"]) == ("Rice bowl (large)", 800, "extra rice"), got
    await refused("update_meal_log", log_id=m["id"], calories=-1)
    await call("update_meal_log", log_id=m["id"], date=yesterday)
    assert (await call("get_meal_log"))["entries"] == [] and len((await call("get_meal_log", date=yesterday))["entries"]) == 1
    await call("delete_meal_log", log_id=m["id"])
    t = (await call("add_meal_template", name="Oats", meal_type="breakfast", calories=450, protein_g=35, ingredients=[]))["template"]
    await call("update_meal_template", template_id=t["id"], meal_type="snack", calories="500")
    tpl = (await call("get_meal_templates"))["templates"][0]
    assert (tpl["meal_type"], tpl["calories"]) == ("snack", 500), tpl
    await call("delete_meal_template", template_id=t["id"])
    assert (await call("get_meal_templates"))["templates"] == []
    await refused("delete_meal_template", template_id=t["id"])                # already gone
    print("  PASS meals: logs and templates, add, read, update (incl. moving day), delete")

    # ---- workouts
    w = (await call("log_workout", workout_type="strength", duration_minutes=40, intensity="moderate", name="Push Day",
                    exercises=[{"name": "Bench Press", "sets": [{"reps": 8, "weight_kg": 60}]}]))["workout"]
    await conn.execute(
        "INSERT INTO workout_sets (user_id, workout_log_id, exercise_name, set_number, reps, weight_kg) "
        "VALUES ($1, $2, 'Bench Press', 1, 8, 60)", uid, w["id"])
    await call("update_workout", workout_id=w["id"], name="Chest Day", duration_minutes="45",
               exercises=[{"name": "Bench Press", "sets": [{"reps": 8, "weight_kg": 62.5}, {"reps": 6, "weight_kg": 65}]}])
    got = (await call("get_workouts"))["workouts"][0]
    details = json.loads(got["details"]) if isinstance(got["details"], str) else got["details"]
    assert (got["name"], got["duration_minutes"], len(got["exercises"][0]["sets"])) == ("Chest Day", 45, 2), got
    assert details["total_volume_kg"] == 890, details
    await refused("update_workout", workout_id=w["id"], duration_minutes=0)
    await call("delete_workout", workout_id=w["id"])                          # it has a workout_sets row
    assert (await call("get_workouts"))["workouts"] == []
    wt = (await call("add_workout_template", name="Leg Day", workout_type="strength", exercises=[{"name": "Squat"}]))["template"]
    await call("update_workout_template", template_id=wt["id"], name="Leg Day A", exercises=[{"name": "Squat"}, {"name": "Lunge"}])
    t2 = (await call("get_workout_templates"))["templates"][0]
    exercises = json.loads(t2["exercises"]) if isinstance(t2["exercises"], str) else t2["exercises"]
    assert t2["name"] == "Leg Day A" and len(exercises) == 2, t2
    await call("delete_workout_template", template_id=wt["id"])
    assert (await call("get_workout_templates"))["templates"] == []
    print("  PASS workouts: logs (with sets) and templates, add, read, update, delete")

    # ---- schedule
    ev = (await call("add_schedule_event", title="Gym", event_type="exercise", day_of_week=0,
                     start_time="07:00", end_time="08:00"))["event"]
    await refused("add_schedule_event", title="Bad", event_type="exercise", day_of_week=0, start_time="09:00", end_time="08:00")
    await refused("update_schedule_event", event_id=ev["id"], end_time="06:30")
    await call("update_schedule_event", event_id=ev["id"], event_type="routine", day_of_week="2", end_time="08:30")
    row = await conn.fetchrow("SELECT event_type, day_of_week, end_time FROM schedule_events WHERE id = $1", ev["id"])
    assert (str(row["event_type"]).upper(), row["day_of_week"], str(row["end_time"])) == ("ROUTINE", 2, "08:30:00"), row
    await call("delete_schedule_event", event_id=ev["id"])
    assert await conn.fetchval("SELECT is_active FROM schedule_events WHERE id = $1", ev["id"]) is False
    print("  PASS schedule: add, update (type, day, time), end-after-start enforced, delete")

    # ---- pantry
    item = (await call("add_inventory_item", name="Peanuts", quantity="60", unit="g", category="pantry",
                       status="need_to_buy", storage="pantry"))["item"]
    await call("update_inventory_item", item_id=item["id"], quantity="100", status="ok", notes="roasted")
    got = (await call("get_inventory"))["items"][0]
    assert (got["quantity"], got["status"], got["notes"]) == (100, "ok", "roasted"), got
    await refused("update_inventory_item", item_id=item["id"], status="gone")
    await call("delete_inventory_item", item_id=item["id"])
    print("  PASS pantry: add, read, update (status, notes), delete")

    # ---- body weight and personal records
    await call("log_body_weight", weight_kg=91.0, date=yesterday)
    await call("log_body_weight", weight_kg=90.5, date=today)
    hist = (await call("get_body_weight_history"))["entries"]
    assert len(hist) == 2 and "id" in hist[0], hist
    assert (await call("delete_body_weight", date=today))["current_weight_kg"] == 91.0
    assert await conn.fetchval("SELECT current_weight_kg FROM users WHERE id = $1", uid) == 91.0
    await refused("delete_body_weight", date=today)
    await call("upsert_personal_record", exercise_name="Bench Press", weight_kg=100, reps=1)
    await call("update_personal_record", exercise_name="Bench Press", weight_kg=95, notes="corrected")
    pr = (await call("get_personal_records"))["personal_records"][0]
    assert (pr["weight_kg"], pr["notes"]) == (95, "corrected") and "id" in pr, pr
    await refused("update_personal_record", user=other, exercise_name="Bench Press", weight_kg=1)
    await call("delete_personal_record", exercise_name="Bench Press")
    assert (await call("get_personal_records"))["personal_records"] == []
    print("  PASS body weight and PRs: log, read, delete (profile weight follows), correct, delete")

    await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
