"""`meetings` table (§3.1, §3.2) plus the status/encryption vocabularies.

`scheduled_start IS NULL` is the single discriminator between an instant and a
scheduled meeting — no `type` column (§3.2). `invite_token` (the `?pwd=` value)
and `passcode` (the short human-typed code) are deliberately different values
with different threat models.
"""

from __future__ import annotations

from datetime import datetime
from typing import Final

from sqlalchemy import Index
from sqlmodel import Field, SQLModel

from app.models.base import new_id, utcnow

# --- Status vocabulary (§5.4) ------------------------------------------------
STATUS_SCHEDULED: Final = "scheduled"
STATUS_LIVE: Final = "live"
STATUS_ENDED: Final = "ended"
STATUS_CANCELLED: Final = "cancelled"

MEETING_STATUSES: Final[frozenset[str]] = frozenset(
    {STATUS_SCHEDULED, STATUS_LIVE, STATUS_ENDED, STATUS_CANCELLED}
)

ENCRYPTION_ENHANCED: Final = "enhanced"
ENCRYPTION_E2EE: Final = "e2ee"
ENCRYPTION_MODES: Final[frozenset[str]] = frozenset(
    {ENCRYPTION_ENHANCED, ENCRYPTION_E2EE}
)


class Meeting(SQLModel, table=True):
    __tablename__ = "meetings"
    # §3.2 verbatim. Declared as named Index objects rather than column-level
    # unique=True so the emitted index names match the spec exactly — the two
    # unique ones would otherwise land as auto-named UNIQUE constraints with no
    # index row to assert against. The dashboard's two hot queries (upcoming =
    # host + scheduled_start, recent = host + status) are covered by the
    # composites.
    __table_args__ = (
        Index("ix_meetings_number", "meeting_number", unique=True),
        Index("ix_meetings_invite", "invite_token", unique=True),
        Index("ix_meetings_host_start", "host_id", "scheduled_start"),
        Index("ix_meetings_host_status", "host_id", "status"),
    )

    id: str = Field(default_factory=new_id, primary_key=True)
    # 11 digits, displayed as ### #### #### (§3.3). Stored as text so a leading
    # digit is never lost and formatting is a pure string operation.
    meeting_number: str = Field(index=False)
    host_id: str = Field(foreign_key="users.id")
    topic: str
    description: str | None = Field(default=None)
    scheduled_start: datetime | None = Field(default=None)  # null => instant
    duration_minutes: int = Field(default=40)
    timezone: str = Field(default="UTC")
    passcode: str
    invite_token: str = Field(index=False)
    status: str = Field(default=STATUS_SCHEDULED)
    use_pmi: bool = Field(default=False)
    waiting_room: bool = Field(default=True)
    host_video_on: bool = Field(default=True)
    participant_video_on: bool = Field(default=True)
    allow_transcription: bool = Field(default=False)
    chat_before_after: bool = Field(default=True)
    encryption: str = Field(default=ENCRYPTION_ENHANCED)
    started_at: datetime | None = Field(default=None)
    ended_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow)
