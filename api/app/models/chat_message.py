"""`chat_messages` table (§3.1).

Persisted so the chat drawer's history survives a refresh (§6.7). Ordered reads
are always (meeting_id, sent_at), which is exactly the §3.2 index.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Index
from sqlmodel import Field, SQLModel

from app.models.base import new_id, utcnow

# §5.2 — `chat.send` bodies are capped at 2000 chars and server-trimmed.
MAX_CHAT_BODY_LENGTH = 2000


class ChatMessage(SQLModel, table=True):
    __tablename__ = "chat_messages"
    __table_args__ = (Index("ix_chat_meeting_time", "meeting_id", "sent_at"),)

    id: str = Field(default_factory=new_id, primary_key=True)
    meeting_id: str = Field(foreign_key="meetings.id", index=False)
    participant_id: str = Field(foreign_key="participants.id")
    body: str
    sent_at: datetime = Field(default_factory=utcnow)
