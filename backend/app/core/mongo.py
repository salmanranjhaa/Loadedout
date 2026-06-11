"""Lazy MongoDB client — currently used for binary blobs (profile pictures)."""
from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import get_settings

_client: AsyncIOMotorClient | None = None


def get_mongo_db():
    global _client
    settings = get_settings()
    if _client is None:
        _client = AsyncIOMotorClient(settings.MONGODB_URI or "mongodb://mongo:27017")
    return _client[settings.MONGODB_DB_NAME or "lifeplan"]
