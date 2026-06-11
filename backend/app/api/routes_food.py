"""Food database search backed by Open Food Facts (free, no API key).

Gives the meal logger a real product database (MyFitnessPal-style) instead of
relying only on the small built-in food list. Results are normalized to
per-100g macros so the frontend portion selector works unchanged.
"""
import logging
import time
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, Query, Request

from app.core.auth import get_current_user
from app.core.limiter import limiter

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/food", tags=["food"])

# Legacy CGI endpoint — the only OFF endpoint with free-text search
OFF_SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl"
OFF_FIELDS = "product_name,brands,nutriments,serving_quantity,code"

# Tiny in-memory cache — food searches repeat constantly ("chicken", "rice"…)
_cache: dict[str, tuple[float, list]] = {}
_CACHE_TTL = 3600
_CACHE_MAX = 500


def _round1(value) -> Optional[float]:
    try:
        return round(float(value), 1)
    except (TypeError, ValueError):
        return None


def _normalize_product(product: dict) -> Optional[dict]:
    name = (product.get("product_name") or "").strip()
    nutriments = product.get("nutriments") or {}
    calories = _round1(nutriments.get("energy-kcal_100g"))
    if not name or calories is None:
        return None
    return {
        "name": name[:80],
        "brand": (product.get("brands") or "").split(",")[0].strip()[:40] or None,
        "calories": calories,
        "protein_g": _round1(nutriments.get("proteins_100g")) or 0,
        "carbs_g": _round1(nutriments.get("carbohydrates_100g")) or 0,
        "fat_g": _round1(nutriments.get("fat_100g")) or 0,
        "fiber_g": _round1(nutriments.get("fiber_100g")),
        "serving_g": 100,
        "source": "openfoodfacts",
        "barcode": product.get("code"),
    }


@router.get("/barcode/{code}")
@limiter.limit("30/minute")
async def lookup_barcode(
    request: Request,
    code: str,
    user: dict = Depends(get_current_user),
):
    """I look up a scanned barcode on Open Food Facts."""
    code = code.strip()
    if not code.isdigit() or not 6 <= len(code) <= 14:
        return {"item": None, "error": "invalid_barcode"}

    cached = _cache.get(f"bc:{code}")
    if cached and time.monotonic() - cached[0] < _CACHE_TTL:
        return {"item": cached[1]}

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                f"https://world.openfoodfacts.org/api/v2/product/{code}.json",
                params={"fields": OFF_FIELDS},
                headers={"User-Agent": "LoadedOut/1.0 (personal fitness app)"},
            )
            if resp.status_code == 404:
                return {"item": None, "error": "not_found"}
            resp.raise_for_status()
            product = resp.json().get("product") or {}
    except Exception as e:
        logger.warning("Barcode lookup failed for %s: %s", code, e)
        return {"item": None, "error": "lookup_failed"}

    item = _normalize_product(product)
    if item:
        _cache[f"bc:{code}"] = (time.monotonic(), item)
    return {"item": item, "error": None if item else "no_nutrition_data"}


@router.get("/search")
@limiter.limit("30/minute")
async def search_food(
    request: Request,
    q: str = Query(..., min_length=2, max_length=80),
    limit: int = Query(15, ge=1, le=30),
    user: dict = Depends(get_current_user),
):
    """I search Open Food Facts and return per-100g normalized foods."""
    key = f"{q.strip().lower()}:{limit}"
    cached = _cache.get(key)
    if cached and time.monotonic() - cached[0] < _CACHE_TTL:
        return {"items": cached[1], "source": "cache"}

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                OFF_SEARCH_URL,
                params={
                    "search_terms": q.strip(),
                    "search_simple": 1,
                    "action": "process",
                    "json": 1,
                    "fields": OFF_FIELDS,
                    "page_size": limit * 2,  # over-fetch; many lack kcal data
                    "sort_by": "unique_scans_n",
                },
                headers={"User-Agent": "LoadedOut/1.0 (personal fitness app)"},
            )
            resp.raise_for_status()
            products = resp.json().get("products", [])
    except Exception as e:
        logger.warning("Open Food Facts search failed for %r: %s", q, e)
        return {"items": [], "source": "error"}

    items = []
    seen_names = set()
    for p in products:
        norm = _normalize_product(p)
        if not norm:
            continue
        dedupe_key = norm["name"].lower()
        if dedupe_key in seen_names:
            continue
        seen_names.add(dedupe_key)
        items.append(norm)
        if len(items) >= limit:
            break

    if len(_cache) >= _CACHE_MAX:
        _cache.clear()
    _cache[key] = (time.monotonic(), items)
    return {"items": items, "source": "openfoodfacts"}
