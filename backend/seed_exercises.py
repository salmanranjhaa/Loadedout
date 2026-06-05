#!/usr/bin/env python3
"""Seed the exercises table from the free-exercise-db dataset."""
import json
import psycopg2
from psycopg2.extras import execute_values
import os

DB_URL = os.environ.get(
    "DATABASE_URL_SYNC",
    "postgresql://lifeplan_user:L0adedOut2026!@localhost:5432/lifeplan_db",
).replace("postgresql+psycopg2://", "postgresql://")

DATA_PATH = os.path.join(os.path.dirname(__file__), "seed_data", "exercises.json")

# jsDelivr CDN base URL for images
IMAGE_BASE = "https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises"


def normalize_id(name: str) -> str:
    """Convert exercise name to a URL-safe ID."""
    return (
        name.lower()
        .replace(" ", "_")
        .replace("/", "_")
        .replace("(", "")
        .replace(")", "")
        .replace("-", "_")
        .replace("'", "")
        .replace(",", "")
        .replace(".", "")
        .strip("_")
    )


def seed():
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    rows = []
    seen_ids = set()
    for ex in data:
        ex_id = normalize_id(ex["id"])
        if ex_id in seen_ids:
            continue
        seen_ids.add(ex_id)

        images = ex.get("images", [])
        start_url = f"{IMAGE_BASE}/{images[0]}" if len(images) > 0 else None
        end_url = f"{IMAGE_BASE}/{images[1]}" if len(images) > 1 else start_url

        rows.append((
            ex_id,
            ex["name"],
            ex.get("category"),
            ex.get("equipment"),
            json.dumps(ex.get("primaryMuscles", [])),
            json.dumps(ex.get("secondaryMuscles", [])),
            json.dumps(ex.get("instructions", [])),
            start_url,
            end_url,
            ex.get("category"),
            ex.get("level"),
            ex.get("force"),
            ex.get("mechanic"),
        ))

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    # Clear existing
    cur.execute("TRUNCATE TABLE exercises RESTART IDENTITY CASCADE")

    execute_values(
        cur,
        """
        INSERT INTO exercises (
            id, name, body_part, equipment,
            primary_muscles, secondary_muscles, instructions,
            image_start_url, image_end_url,
            category, level, force, mechanic
        ) VALUES %s
        """,
        rows,
        page_size=500,
    )

    conn.commit()
    cur.execute("SELECT COUNT(*) FROM exercises")
    count = cur.fetchone()[0]
    print(f"Seeded {count} exercises.")
    cur.close()
    conn.close()


if __name__ == "__main__":
    seed()
