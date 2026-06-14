"""End-to-end tests for the food capture pipeline: barcode lookup, food search,
and photo macro estimation. These back the frontend's Barcode / Photo tabs.

The outbound Open Food Facts HTTP calls and the Vertex photo estimator are
mocked, so this runs fully headless with no network, DB, or GCP credentials.

Run standalone (no pytest needed, matching tests/test_ai_parsing.py):
    python tests/test_food_endpoints.py
Inside the deployed container:
    docker exec infra-backend-1 python tests/test_food_endpoints.py
"""
import asyncio
import base64
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import httpx  # noqa: E402

from app.main import app  # noqa: E402
from app.core.auth import get_current_user  # noqa: E402
from app.api import routes_food  # noqa: E402
from app.services import vertex_ai  # noqa: E402

API = "/api/v1"

# Auth: every endpoint depends on get_current_user — stub a fixed test user.
app.dependency_overrides[get_current_user] = lambda: {"sub": "test-user", "username": "tester"}


# ── Mock Open Food Facts HTTP layer ───────────────────────────────────────────
# routes_food does `async with httpx.AsyncClient(...) as client: client.get(...)`.
# We swap in a fake whose .get() is driven by a per-test handler.
_off_handler = None  # set by each test: (url, kwargs) -> FakeResp


class FakeResp:
    def __init__(self, status_code=200, json_data=None):
        self.status_code = status_code
        self._json = json_data if json_data is not None else {}

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("error", request=None, response=None)

    def json(self):
        return self._json


class FakeAsyncClient:
    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, url, **kwargs):
        assert _off_handler is not None, "test did not install an OFF handler"
        return _off_handler(url, kwargs)


def _install_off(handler):
    global _off_handler
    _off_handler = handler
    routes_food._cache.clear()  # avoid cross-test cache hits


def _client():
    transport = httpx.ASGITransport(app=app)
    return httpx.AsyncClient(transport=transport, base_url="http://test")


# ── Tests ─────────────────────────────────────────────────────────────────────
async def test_barcode_invalid_rejected():
    _install_off(lambda url, kw: FakeResp(200, {}))
    async with _client() as c:
        r = await c.get(f"{API}/food/barcode/abc")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["item"] is None and body["error"] == "invalid_barcode", body


async def test_barcode_normalizes_product():
    product = {
        "product_name": "Nutella",
        "brands": "Ferrero, Other",
        "code": "3017620422003",
        "nutriments": {
            "energy-kcal_100g": 539,
            "proteins_100g": 6.3,
            "carbohydrates_100g": 57.5,
            "fat_100g": 30.9,
            "fiber_100g": 0,
        },
    }
    _install_off(lambda url, kw: FakeResp(200, {"product": product}))
    async with _client() as c:
        r = await c.get(f"{API}/food/barcode/3017620422003")
    assert r.status_code == 200, r.text
    item = r.json()["item"]
    assert item is not None, "expected a normalized item"
    assert item["name"] == "Nutella"
    assert item["brand"] == "Ferrero"          # only first brand, trimmed
    assert item["calories"] == 539.0
    assert item["protein_g"] == 6.3
    assert item["serving_g"] == 100             # normalized to per-100g
    assert item["barcode"] == "3017620422003"


async def test_barcode_not_found():
    _install_off(lambda url, kw: FakeResp(404, {}))
    async with _client() as c:
        r = await c.get(f"{API}/food/barcode/0000000000000")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["item"] is None and body["error"] == "not_found", body


async def test_barcode_no_nutrition_data():
    # Product exists but has no kcal -> cannot normalize.
    product = {"product_name": "Mystery", "code": "1234567", "nutriments": {}}
    _install_off(lambda url, kw: FakeResp(200, {"product": product}))
    async with _client() as c:
        r = await c.get(f"{API}/food/barcode/1234567")
    body = r.json()
    assert body["item"] is None and body["error"] == "no_nutrition_data", body


async def test_search_dedupes_and_limits():
    products = {
        "products": [
            {"product_name": "Chicken Breast", "code": "1", "nutriments": {"energy-kcal_100g": 165, "proteins_100g": 31}},
            {"product_name": "chicken breast", "code": "2", "nutriments": {"energy-kcal_100g": 170, "proteins_100g": 30}},  # dup name
            {"product_name": "Chicken Thigh", "code": "3", "nutriments": {"energy-kcal_100g": 209, "proteins_100g": 26}},
            {"product_name": "No Calories", "code": "4", "nutriments": {}},  # dropped: no kcal
        ]
    }
    _install_off(lambda url, kw: FakeResp(200, products))
    async with _client() as c:
        r = await c.get(f"{API}/food/search", params={"q": "chicken", "limit": 5})
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    names = [i["name"].lower() for i in items]
    assert names == ["chicken breast", "chicken thigh"], names  # deduped, kcal-less dropped


async def test_search_short_query_rejected():
    _install_off(lambda url, kw: FakeResp(200, {"products": []}))
    async with _client() as c:
        r = await c.get(f"{API}/food/search", params={"q": "a"})
    assert r.status_code == 422, r.text  # min_length=2 validation


async def test_photo_estimate_happy_path():
    async def fake_estimate(image_bytes, mime_type, hint=""):
        assert image_bytes == b"hello-image-bytes"
        assert mime_type == "image/jpeg"
        return {"name": "Grilled Chicken", "calories": 330, "protein_g": 62,
                "carbs_g": 0, "fat_g": 7, "confidence": "high"}

    vertex_ai.estimate_macros_from_image = fake_estimate
    payload = {
        "image_base64": base64.b64encode(b"hello-image-bytes").decode(),
        "mime_type": "image/jpeg",
        "meal_type": "lunch",
        "hint": "about 250g",
    }
    async with _client() as c:
        r = await c.post(f"{API}/meals/photo-estimate", json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "pending_confirmation"
    assert body["estimated"]["name"] == "Grilled Chicken"
    assert body["estimated"]["calories"] == 330


async def test_photo_estimate_bad_mime():
    payload = {"image_base64": base64.b64encode(b"x").decode(), "mime_type": "image/gif"}
    async with _client() as c:
        r = await c.post(f"{API}/meals/photo-estimate", json=payload)
    assert r.status_code == 400, r.text


async def test_photo_estimate_invalid_base64():
    payload = {"image_base64": "!!!not base64!!!", "mime_type": "image/jpeg"}
    async with _client() as c:
        r = await c.post(f"{API}/meals/photo-estimate", json=payload)
    assert r.status_code == 400, r.text


async def test_photo_estimate_too_large():
    big = base64.b64encode(b"\0" * (8 * 1024 * 1024 + 10)).decode()
    payload = {"image_base64": big, "mime_type": "image/jpeg"}
    async with _client() as c:
        r = await c.post(f"{API}/meals/photo-estimate", json=payload)
    assert r.status_code == 413, r.text


async def test_photo_estimate_ai_failure_maps_to_422():
    async def fake_estimate(image_bytes, mime_type, hint=""):
        return {"error": "Could not analyze the photo"}

    vertex_ai.estimate_macros_from_image = fake_estimate
    payload = {"image_base64": base64.b64encode(b"x").decode(), "mime_type": "image/jpeg"}
    async with _client() as c:
        r = await c.post(f"{API}/meals/photo-estimate", json=payload)
    assert r.status_code == 422, r.text


async def _main():
    # Swap only the `httpx` name *inside routes_food* so its outbound OFF calls
    # hit our fake, while the real httpx module (used by the ASGI test client
    # below) stays intact.
    import types
    routes_food.httpx = types.SimpleNamespace(
        AsyncClient=FakeAsyncClient,
        HTTPStatusError=httpx.HTTPStatusError,
    )

    tests = [v for k, v in sorted(globals().items())
             if k.startswith("test_") and asyncio.iscoroutinefunction(v)]
    failures = 0
    for fn in tests:
        try:
            await fn()
            print(f"  PASS {fn.__name__}")
        except Exception as e:  # noqa: BLE001
            failures += 1
            print(f"  FAIL {fn.__name__}: {type(e).__name__}: {e}")
    print(f"\n{len(tests) - failures}/{len(tests)} passed")
    return failures


if __name__ == "__main__":
    sys.exit(1 if asyncio.run(_main()) else 0)
