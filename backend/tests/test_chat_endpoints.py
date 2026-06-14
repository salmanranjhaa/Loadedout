"""Integration tests for the chat-history session endpoints that back the
redesigned AI chat sidebar (list / create / update / get / delete).

These run against the real database but are SELF-CLEANING: every session row
created is deleted in a finally block, so they leave no residue. Auth is
dependency-overridden to a real user id (chat_sessions.user_id is a FK to
users.id, so a valid user must exist).

Run inside the deployed container:
    docker exec infra-backend-1 python tests/test_chat_endpoints.py
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import httpx  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app.main import app  # noqa: E402
from app.core.auth import get_current_user  # noqa: E402
from app.core.database import async_session  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.chat import ChatSession  # noqa: E402

API = "/api/v1"


def _client():
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


async def _pick_user_id():
    async with async_session() as s:
        r = await s.execute(select(User.id).order_by(User.id).limit(1))
        uid = r.scalar_one_or_none()
    if uid is None:
        raise RuntimeError("no users in DB to attach a test chat session to")
    return uid


async def _delete_session(session_id):
    async with async_session() as s:
        row = await s.get(ChatSession, session_id)
        if row:
            await s.delete(row)
            await s.commit()


async def run():
    uid = await _pick_user_id()
    app.dependency_overrides[get_current_user] = lambda: {"sub": uid, "username": "test"}

    created_id = None
    checks = []  # (name, ok, detail)

    def check(name, cond, detail=""):
        checks.append((name, bool(cond), detail))

    try:
        async with _client() as c:
            # 1. Create (POST) — title derived from first user message
            create_payload = {"messages": [
                {"role": "user", "content": "What should I eat post-workout for recovery?"},
                {"role": "assistant", "content": "Aim for ~30g protein and some carbs."},
            ]}
            r = await c.post(f"{API}/chat/sessions", json=create_payload)
            check("create returns 200", r.status_code == 200, r.text)
            created_id = r.json().get("id")
            check("create returns id", created_id is not None)
            check("title derived from first user msg",
                  r.json().get("title", "").startswith("What should I eat"), r.text)

            # 2. List (GET) — includes updated_at and our new row
            r = await c.get(f"{API}/chat/sessions")
            check("list returns 200", r.status_code == 200, r.text)
            rows = r.json()
            mine = next((s for s in rows if s["id"] == created_id), None)
            check("created session appears in list", mine is not None)
            check("list row exposes updated_at", mine and "updated_at" in mine, str(mine))
            check("list row message_count == 2", mine and mine.get("message_count") == 2, str(mine))

            # 3. Update (PUT) — grow the conversation in place
            upd_payload = {"messages": create_payload["messages"] + [
                {"role": "user", "content": "And how much water?"},
                {"role": "assistant", "content": "Roughly 500ml over the next hour."},
            ]}
            r = await c.put(f"{API}/chat/sessions/{created_id}", json=upd_payload)
            check("update returns 200", r.status_code == 200, r.text)

            # 4. Get full (GET id) — messages reflect the update
            r = await c.get(f"{API}/chat/sessions/{created_id}")
            check("get returns 200", r.status_code == 200, r.text)
            check("get returns 4 messages after update",
                  len(r.json().get("messages", [])) == 4, r.text)

            # 5. Update rejects empty messages
            r = await c.put(f"{API}/chat/sessions/{created_id}", json={"messages": []})
            check("update rejects empty messages (400)", r.status_code == 400, r.text)

            # 6. Delete (DELETE) then confirm gone
            r = await c.delete(f"{API}/chat/sessions/{created_id}")
            check("delete returns 200", r.status_code == 200, r.text)
            r = await c.get(f"{API}/chat/sessions/{created_id}")
            check("get after delete returns 404", r.status_code == 404, r.text)
            if r.status_code == 404:
                created_id = None  # already gone; nothing to clean up

            # 7. Update on missing session → 404
            r = await c.put(f"{API}/chat/sessions/99999999", json=create_payload)
            check("update missing session returns 404", r.status_code == 404, r.text)
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        if created_id:
            await _delete_session(created_id)

    failures = 0
    for name, ok, detail in checks:
        if ok:
            print(f"  PASS {name}")
        else:
            failures += 1
            print(f"  FAIL {name}: {detail}")
    print(f"\n{len(checks) - failures}/{len(checks)} passed")
    return failures


if __name__ == "__main__":
    sys.exit(1 if asyncio.run(run()) else 0)
