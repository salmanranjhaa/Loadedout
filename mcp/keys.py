"""
Personal keys for the Loadout MCP server.

Run inside the mcp container:
  python keys.py create <email> [label]   prints the connector URL (shown once)
  python keys.py list                     keys and when each was last used
  python keys.py revoke <email>           switches off every live key of that user

Only a SHA-256 of each key is stored, so a lost key can't be shown again:
revoke it and create a new one.
"""

import asyncio
import os
import secrets
import sys

import asyncpg

from server import DATABASE_URL, hash_key

PUBLIC_URL = os.environ.get("MCP_PUBLIC_URL", "https://loadedout.online/mcp/")


async def create(conn: asyncpg.Connection, email: str, label: str | None) -> None:
    user_id = await conn.fetchval("SELECT id FROM users WHERE email = $1 AND is_active = true", email)
    if not user_id:
        sys.exit(f"No active user with email {email}")
    key = "lo_" + secrets.token_urlsafe(32)
    await conn.execute(
        "INSERT INTO mcp_keys (user_id, key_hash, label) VALUES ($1, $2, $3)",
        user_id, hash_key(key), label,
    )
    print(f"Key created for {email}. Paste this URL into Claude (it is not shown again):\n")
    print(f"{PUBLIC_URL}?key={key}\n")


async def list_keys(conn: asyncpg.Connection) -> None:
    rows = await conn.fetch(
        """
        SELECT u.email, k.id, k.label, k.created_at, k.last_used_at, k.revoked_at
        FROM mcp_keys k JOIN users u ON u.id = k.user_id
        ORDER BY u.email, k.created_at
        """
    )
    if not rows:
        print("No keys yet.")
    for r in rows:
        state = f"revoked {r['revoked_at']:%Y-%m-%d}" if r["revoked_at"] else "live"
        used = f"last used {r['last_used_at']:%Y-%m-%d %H:%M}" if r["last_used_at"] else "never used"
        print(f"#{r['id']}  {r['email']}  {r['label'] or ''}  created {r['created_at']:%Y-%m-%d}  {used}  {state}")


async def revoke(conn: asyncpg.Connection, email: str) -> None:
    result = await conn.execute(
        """
        UPDATE mcp_keys SET revoked_at = now()
        WHERE revoked_at IS NULL AND user_id = (SELECT id FROM users WHERE email = $1)
        """,
        email,
    )
    print(f"{result.split()[-1]} key(s) revoked for {email}.")


async def main(argv: list[str]) -> None:
    if not argv or argv[0] not in {"create", "list", "revoke"} or (argv[0] != "list" and len(argv) < 2):
        sys.exit(__doc__)
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        if argv[0] == "create":
            await create(conn, argv[1], " ".join(argv[2:]) or None)
        elif argv[0] == "list":
            await list_keys(conn)
        else:
            await revoke(conn, argv[1])
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:]))
