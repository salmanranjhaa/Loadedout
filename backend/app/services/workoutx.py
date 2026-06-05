"""WorkoutX API client for fetching real exercise GIFs and data."""
import logging
from urllib.parse import quote
import httpx
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

BASE_URL = "https://api.workoutxapp.com/v1"


def _headers():
    key = settings.WORKOUTX_API_KEY
    if not key:
        return None
    return {"X-WorkoutX-Key": key}


def _parse_list_response(data):
    """WorkoutX list endpoints return {"total", "count", "data": [...]}."""
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return data.get("data", [])
    return []


async def search_exercises(name: str, limit: int = 5):
    """Search WorkoutX by exercise name using the free /name/{name} endpoint."""
    hdrs = _headers()
    if not hdrs:
        return []
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            # Free-tier endpoint — returns partial name matches
            # URL-encode name so slashes and special chars don't break the path
            encoded_name = quote(name, safe="")
            resp = await client.get(
                f"{BASE_URL}/exercises/name/{encoded_name}",
                headers=hdrs,
                params={"limit": limit},
            )
            resp.raise_for_status()
            return _parse_list_response(resp.json())
    except Exception as e:
        logger.warning("WorkoutX search failed for %r: %s", name, e)
        return []


async def get_exercise(exercise_id: str):
    """Get a single exercise by WorkoutX ID."""
    hdrs = _headers()
    if not hdrs:
        return None
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{BASE_URL}/exercises/exercise/{exercise_id}",
                headers=hdrs,
            )
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        logger.warning("WorkoutX get failed for %s: %s", exercise_id, e)
        return None


async def list_exercises(body_part: str | None = None, limit: int = 50, offset: int = 0):
    """List exercises from WorkoutX, optionally filtered by body part."""
    hdrs = _headers()
    if not hdrs:
        return []
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            url = f"{BASE_URL}/exercises"
            if body_part:
                url = f"{BASE_URL}/exercises/bodyPart/{body_part}"
            resp = await client.get(
                url,
                headers=hdrs,
                params={"limit": limit, "offset": offset},
            )
            resp.raise_for_status()
            return _parse_list_response(resp.json())
    except Exception as e:
        logger.warning("WorkoutX list failed: %s", e)
        return []


async def fetch_gif(gif_url: str) -> bytes:
    """Download a GIF binary from WorkoutX (requires API key)."""
    hdrs = _headers()
    if not hdrs:
        raise RuntimeError("WorkoutX API key not configured")
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(gif_url, headers=hdrs)
        resp.raise_for_status()
        return resp.content
