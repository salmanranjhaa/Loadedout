"""
Self-check for the MCP server's key gate and Streamable HTTP transport.
Runs the real app on a local port with the database swapped for fakes.

  python test_server.py      (needs the packages in requirements.txt + httpx)
"""

import asyncio
import contextlib
import json
import socket
import threading
import time

import httpx
import uvicorn
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

import server

KEYS = {"good-key": 7, "other-key": 9}


async def fake_user_for_key(key):
    return KEYS.get(key)


class FakePool:
    @contextlib.asynccontextmanager
    async def acquire(self):
        yield None


async def fake_get_pool():
    return FakePool()


async def fake_dispatch(name, args, conn, user_id):
    return {"tool": name, "user_id": user_id}


def start(port: int) -> uvicorn.Server:
    srv = uvicorn.Server(uvicorn.Config(server.build_app(), host="127.0.0.1", port=port, log_level="warning"))
    threading.Thread(target=srv.run, daemon=True).start()
    while not srv.started:
        time.sleep(0.05)
    return srv


async def call_as(url: str, headers: dict | None = None):
    async with streamablehttp_client(url, headers=headers) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = (await session.list_tools()).tools
            # Someone else's email in the arguments must not change whose data is used
            result = await session.call_tool("get_profile", {"user_email": "someone@else.test"})
            return tools, json.loads(result.content[0].text)


def main():
    server.user_for_key, server.get_pool, server._dispatch = fake_user_for_key, fake_get_pool, fake_dispatch
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    srv = start(port)
    base = f"http://127.0.0.1:{port}/mcp/"
    try:
        hello = {"jsonrpc": "2.0", "id": 1, "method": "ping"}
        assert httpx.post(base, json=hello).status_code == 401, "no key must be refused"
        assert httpx.post(base + "?key=wrong", json=hello).status_code == 401, "an unknown key must be refused"
        print("  PASS requests without a valid key get 401")

        tools, profile = asyncio.run(call_as(base + "?key=good-key"))
        assert len(tools) > 30, len(tools)
        for t in tools:
            schema = t.inputSchema
            assert "user_email" not in schema.get("properties", {}) and "user_email" not in schema.get("required", []), t.name
        print(f"  PASS {len(tools)} tools, none asks for an email")
        assert profile == {"tool": "get_profile", "user_id": 7}, profile
        print("  PASS tools act as the key's user, whatever email is passed")

        _, profile = asyncio.run(call_as(base, headers={"Authorization": "Bearer other-key"}))
        assert profile["user_id"] == 9, profile
        print("  PASS the key also works as a Bearer header")
    finally:
        srv.should_exit = True


if __name__ == "__main__":
    main()
