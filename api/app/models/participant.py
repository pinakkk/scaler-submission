"""`participants` table (§3.1, §3.2).

One row per *join attempt*, not per user — rejoining creates a new row so the
history stays auditable. `left_at IS NULL` means currently present; that
predicate drives every participant count, hence the (meeting_id, left_at) index.
"""

from __future__ import annotations

from datetime import datetime
from typing import Final

from sqlalchemy import Index
from sqlmodel import Field, SQLModel

from app.models.base import new_id, utcnow

ROLE_HOST: Final = "host"
ROLE_PARTICIPANT: Final = "participant"
PARTICIPANT_ROLES: Final[frozenset[str]] = frozenset({ROLE_HOST, ROLE_PARTICIPANT})


class Participant(SQLModel, table=True):
    __tablename__ = "participants"
    __table_args__ = (Index("ix_participants_active", "meeting_id", "left_at"),)

    id: str = Field(default_factory=new_id, primary_key=True)
    meeting_id: str = Field(foreign_key="meetings.id", index=False)
    # Nullable per the ER diagram, though the guest-user rule in §3.2 means the
    # join path always populates it. Kept nullable so a purged user row can be
    # detached without destroying meeting history.
    user_id: str | None = Field(default=None, foreign_key="users.id")
    display_name: str
    role: str = Field(default=ROLE_PARTICIPANT)
    # Server-minted UUID held by the client; authorizes subsequent WS frames.
    session_id: str = Field(default_factory=new_id, unique=True, index=True)
    # Maps to the live WebSocket; nulled on disconnect (§3.2).
    connection_id: str | None = Field(default=None)
    is_muted: bool = Field(default=False)
    is_video_on: bool = Field(default=True)
    is_hand_raised: bool = Field(default=False)
    joined_at: datetime = Field(default_factory=utcnow)
    left_at: datetime | None = Field(default=None)
