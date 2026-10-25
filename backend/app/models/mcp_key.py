from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base


class McpKey(Base):
    """A personal key for the MCP server (Claude connector). Only a SHA-256 of
    the key is stored; the key itself is shown once when it is created
    (mcp/keys.py) and the server acts as this key's user, nobody else."""
    __tablename__ = "mcp_keys"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    key_hash = Column(String(64), nullable=False, unique=True)
    label = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
