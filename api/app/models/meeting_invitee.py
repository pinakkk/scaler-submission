"""`meeting_invitees` table (§3.1).

Backs the Schedule form's Invitees field (§6.6). Emails only — an invitee is not
necessarily a user of this app.
"""

from __future__ import annotations

from datetime import datetime

from sqlmodel import Field, SQLModel

from app.models.base import new_id, utcnow


class MeetingInvitee(SQLModel, table=True):
    __tablename__ = "meeting_invitees"

    id: str = Field(default_factory=new_id, primary_key=True)
    meeting_id: str = Field(foreign_key="meetings.id", index=True)
    email: str
    invited_at: datetime = Field(default_factory=utcnow)
