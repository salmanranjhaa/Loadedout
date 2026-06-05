import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.core.auth import get_current_user
from app.core.limiter import limiter
from app.models.chat import ChatSession

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["chat"])


class SaveSessionRequest(BaseModel):
    messages: list[dict]
    title: Optional[str] = None


@router.get("/sessions")
@limiter.limit("100/minute")
async def list_sessions(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I return a list of saved chat sessions (without full messages) for the sidebar."""
    result = await db.execute(
        select(ChatSession)
        .where(ChatSession.user_id == user["sub"])
        .order_by(ChatSession.created_at.desc())
        .limit(50)
    )
    sessions = result.scalars().all()
    return [
        {
            "id": s.id,
            "title": s.title,
            "message_count": len(s.messages) if s.messages else 0,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in sessions
    ]


@router.get("/sessions/{session_id}")
@limiter.limit("100/minute")
async def get_session(
    request: Request,
    session_id: int,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I return a full chat session including all messages."""
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.id == session_id,
            ChatSession.user_id == user["sub"],
        )
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "id": s.id,
        "title": s.title,
        "messages": s.messages,
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }


@router.post("/sessions")
@limiter.limit("30/minute")
async def save_session(
    request: Request,
    body: SaveSessionRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I save a chat session. Title is derived from first user message if not provided."""
    if not body.messages:
        raise HTTPException(status_code=400, detail="No messages to save")

    # I derive the title from the first user message
    title = body.title
    if not title:
        for m in body.messages:
            if m.get("role") == "user":
                content = m.get("content", "")
                title = content[:60] + ("…" if len(content) > 60 else "")
                break
        if not title:
            title = "Chat session"

    session = ChatSession(
        user_id=user["sub"],
        title=title,
        messages=body.messages,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return {"id": session.id, "title": session.title}


@router.delete("/sessions/{session_id}")
@limiter.limit("30/minute")
async def delete_session(
    request: Request,
    session_id: int,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I delete a saved chat session."""
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.id == session_id,
            ChatSession.user_id == user["sub"],
        )
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.delete(s)
    await db.commit()
    return {"deleted": True}
