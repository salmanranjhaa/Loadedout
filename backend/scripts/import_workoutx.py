#!/usr/bin/env python3
"""Import / refresh the exercise library from the WorkoutX API.

WorkoutX exposes ~1300 richly-structured exercises (GIF, instructions, target +
secondary muscles, difficulty, mechanic, force, category) — a superset of the
free-exercise-db seed we shipped with. This script pulls the full list and
merges it into the `exercises` table:

  • existing exercises (matched by normalized name) are ENRICHED in place —
    we backfill gif_url / instructions / muscles / metadata but keep the row's
    id and any cached LLM guidance (llm_description), and
  • exercises we don't have yet are INSERTED with a `wx_<id>` primary key.

It commits page-by-page and dedups by name, so it is safe to re-run / resume
after a rate-limit interruption (the free WorkoutX tier throttles bursts).

Run inside the backend container:
    docker exec infra-backend-1 python -m scripts.import_workoutx
"""
import asyncio
import logging

import httpx
from sqlalchemy import select

from app.core.database import async_session
from app.models.exercise import Exercise
from app.services import workoutx as wx

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("import_workoutx")

# The free WorkoutX tier caps each /exercises page at 10 records and throttles
# bursts, so we walk slowly by offset and back off hard on 429.
PAGE_SIZE = 10
BASE_DELAY = 1.0      # seconds between successful pages
MAX_BACKOFF = 60.0    # cap for exponential backoff on 429
MAX_PAGES = 300       # safety cap so we never loop forever


def _norm_name(name: str) -> str:
    """Loose name key for dedup against the free-exercise-db seed."""
    return " ".join((name or "").lower().split())


def _map_fields(row: dict) -> dict:
    """Map a WorkoutX exercise record onto our Exercise columns."""
    target = row.get("target")
    primary = [target] if target else (row.get("primaryMuscles") or [])
    return {
        "name": (row.get("name") or "").strip()[:120],
        "body_part": row.get("bodyPart"),
        "equipment": row.get("equipment"),
        "primary_muscles": primary or None,
        "secondary_muscles": row.get("secondaryMuscles") or None,
        "instructions": row.get("instructions") or None,
        "gif_url": row.get("gifUrl"),
        "category": row.get("category"),
        "level": row.get("difficulty"),
        "force": row.get("force"),
        "mechanic": row.get("mechanic"),
    }


async def _get_page(client: httpx.AsyncClient, hdrs: dict, offset: int) -> dict:
    """Fetch one page, retrying with exponential backoff on 429/5xx."""
    backoff = 5.0
    while True:
        resp = await client.get(
            f"{wx.BASE_URL}/exercises",
            headers=hdrs,
            params={"limit": PAGE_SIZE, "offset": offset},
        )
        if resp.status_code in (429, 500, 502, 503):
            logger.warning("throttled at offset=%d (%s); sleeping %.0fs",
                           offset, resp.status_code, backoff)
            await asyncio.sleep(backoff)
            backoff = min(MAX_BACKOFF, backoff * 2)
            continue
        resp.raise_for_status()
        return resp.json()


async def main() -> None:
    hdrs = wx._headers()
    if not hdrs:
        raise RuntimeError("WORKOUTX_API_KEY is not configured")

    inserted = updated = skipped = 0
    async with async_session() as db:
        existing = (await db.execute(select(Exercise))).scalars().all()
        by_name = {_norm_name(e.name): e for e in existing}
        used_ids = {e.id for e in existing}
        start_count = len(existing)

        async with httpx.AsyncClient(timeout=20) as client:
            offset = 0
            total = None
            for _ in range(MAX_PAGES):
                body = await _get_page(client, hdrs, offset)
                if total is None and isinstance(body, dict):
                    total = body.get("total")
                batch = wx._parse_list_response(body)
                if not batch:
                    break

                for row in batch:
                    fields = _map_fields(row)
                    if not fields["name"]:
                        skipped += 1
                        continue
                    key = _norm_name(fields["name"])
                    current = by_name.get(key)
                    if isinstance(current, Exercise):
                        for col, val in fields.items():
                            if val not in (None, "", []):
                                setattr(current, col, val)
                        updated += 1
                        continue
                    if current == "new":
                        skipped += 1  # duplicate name within WorkoutX itself
                        continue
                    new_id = f"wx_{row.get('id')}"
                    if new_id in used_ids:
                        new_id = f"wx_{row.get('id')}_{inserted}"
                    used_ids.add(new_id)
                    db.add(Exercise(id=new_id, **fields))
                    by_name[key] = "new"
                    inserted += 1

                await db.commit()  # commit each page so progress survives a stop
                offset += len(batch)
                if offset % 100 == 0 or (total and offset >= total):
                    logger.info("processed %s/%s (ins=%d upd=%d)",
                                offset, total or "?", inserted, updated)
                if total is not None and offset >= total:
                    break
                await asyncio.sleep(BASE_DELAY)

        total_now = len((await db.execute(select(Exercise))).scalars().all())

    logger.info(
        "Done. started=%d inserted=%d updated=%d skipped=%d total_now=%d",
        start_count, inserted, updated, skipped, total_now,
    )


if __name__ == "__main__":
    asyncio.run(main())
