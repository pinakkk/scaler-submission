"""SQLModel table definitions (§3.1).

Only the `services` layer may import from here. Routers must never touch models
directly — see the layering rule in BLUEPRINT §1.3.

`database.init_db()` imports this package so every table below is registered on
`SQLModel.metadata` before `create_all` runs. The explicit re-exports are what
make that registration happen — importing the package alone would otherwise
leave the submodules unloaded and `create_all` a silent no-op.
"""

from __future__ import annotations

from app.models.base import new_id, utcnow
from app.models.chat_message import MAX_CHAT_BODY_LENGTH, ChatMessage
from app.models.meeting import (
    ENCRYPTION_E2EE,
    ENCRYPTION_ENHANCED,
    ENCRYPTION_MODES,
    MEETING_STATUSES,
    STATUS_CANCELLED,
    STATUS_ENDED,
    STATUS_LIVE,
    STATUS_SCHEDULED,
    Meeting,
)
from app.models.meeting_invitee import MeetingInvitee
from app.models.participant import (
    PARTICIPANT_ROLES,
    ROLE_HOST,
    ROLE_PARTICIPANT,
    Participant,
)
from app.models.user import User
from app.models.user_preferences import GALLERY_SIZES, THEMES, UserPreferences

__all__ = [
    "ENCRYPTION_E2EE",
    "ENCRYPTION_ENHANCED",
    "ENCRYPTION_MODES",
    "GALLERY_SIZES",
    "MAX_CHAT_BODY_LENGTH",
    "MEETING_STATUSES",
    "PARTICIPANT_ROLES",
    "ROLE_HOST",
    "ROLE_PARTICIPANT",
    "STATUS_CANCELLED",
    "STATUS_ENDED",
    "STATUS_LIVE",
    "STATUS_SCHEDULED",
    "THEMES",
    "ChatMessage",
    "Meeting",
    "MeetingInvitee",
    "Participant",
    "User",
    "UserPreferences",
    "new_id",
    "utcnow",
]
