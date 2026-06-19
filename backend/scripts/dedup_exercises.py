#!/usr/bin/env python3
"""Collapse duplicate exercises left over from merging WorkoutX into the seed.

After importing the WorkoutX library on top of the free-exercise-db seed, some
movements exist twice under word-order / plural / punctuation variants
("Seated Cable Rows" vs "Cable Seated Row"). The original import only deduped on
an exact normalized name, so those slipped through.

Here we cluster by an order-independent token-set key (punctuation stripped,
trailing plurals normalized) and keep the single best row per cluster — favoring
the entry that has a GIF, then the WorkoutX canonical row, then the richest
instructions. PRs / logs reference exercises by name string (no FK), so dropping
a redundant library row is safe.

Run inside the backend container:
    docker exec infra-backend-1 python -m scripts.dedup_exercises
"""
import asyncio
import re
from collections import defaultdict

from sqlalchemy import select

from app.core.database import async_session
from app.models.exercise import Exercise


def token_key(name: str) -> tuple:
    cleaned = re.sub(r"[^a-z0-9 ]", " ", (name or "").lower())
    toks = [t[:-1] if (len(t) > 3 and t.endswith("s")) else t for t in cleaned.split()]
    return tuple(sorted(toks))


def keep_score(ex: Exercise) -> tuple:
    """Higher sorts first = the row we keep."""
    return (
        1 if ex.gif_url else 0,
        1 if ex.id.startswith("wx_") else 0,
        len(ex.instructions or []),
    )


async def main() -> None:
    async with async_session() as db:
        rows = (await db.execute(select(Exercise))).scalars().all()

        clusters = defaultdict(list)
        for r in rows:
            clusters[token_key(r.name)].append(r)

        deleted = 0
        for members in clusters.values():
            if len(members) < 2:
                continue
            keep, *drop = sorted(members, key=keep_score, reverse=True)
            for d in drop:
                await db.delete(d)
                deleted += 1

        await db.commit()
        total = len((await db.execute(select(Exercise))).scalars().all())

    print(f"Deduped. deleted={deleted} total_now={total}")


if __name__ == "__main__":
    asyncio.run(main())
