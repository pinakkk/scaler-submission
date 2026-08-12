"""Meeting wire contracts (§4).

`MeetingLookupOut` is the security-critical one: it is the *only* shape returned
to unauthenticated callers, and it deliberately names its four fields rather
than inheriting from `MeetingOut`, so a field added to the detail view can never
silently start leaking through `/lookup` (§4).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class HostSummary(BaseModel):
    id: str
    name: str
    avatar_url: str | None = None


class MeetingOut(BaseModel):
    """Full detail — host or authenticated participant only. Carries the
    passcode and invite token, so never return this to an anonymous caller."""

    id: str
    meeting_number: str
    meeting_number_display: str
    host_id: str
    host: HostSummary | None = None
    topic: str
    description: str | None = None
    scheduled_start: datetime | None = None
    duration_minutes: int
    timezone: str
    passcode: str
    invite_token: str
    status: str
    use_pmi: bool
    waiting_room: bool
    host_video_on: bool
    participant_video_on: bool
    allow_transcription: bool
    chat_before_after: bool
    encryption: str
    started_at: datetime | None = None
    ended_at: datetime | None = None
    created_at: datetime
    is_instant: bool
    participant_count: int
    duration_clamped: bool = Field(
        default=False,
        description="True when a basic plan clamped the duration to 40 min (§6.6).",
    )


class MeetingLookupOut(BaseModel):
    """Unauthenticated pre-join probe (§4). Existence, topic, and whether a
    passcode is needed — nothing else. No invite_token, no roster, no host, no
    passcode, no internal id."""

    meeting_number: str
    topic: str
    status: str
    passcode_required: bool


class MeetingListOut(BaseModel):
    items: list[MeetingOut]
    next_cursor: str | None = None
    has_more: bool


class MeetingCreate(BaseModel):
    topic: str | None = Field(
        default=None,
        max_length=200,
        description="Defaults to \"<name>'s Zoom Meeting\" when omitted.",
    )
    description: str | None = None
    scheduled_start: datetime | None = Field(
        default=None, description="Omit for an instant meeting (§3.2)."
    )
    duration_minutes: int = Field(default=40, ge=15, le=1440)
    timezone: str = "UTC"
    use_pmi: bool = False
    waiting_room: bool = True
    host_video_on: bool = True
    participant_video_on: bool = True
    allow_transcription: bool = False
    chat_before_after: bool = True
    encryption: Literal["enhanced", "e2ee"] = "enhanced"
    invitees: list[str] = Field(default_factory=list)


class MeetingUpdate(BaseModel):
    topic: str | None = Field(default=None, max_length=200)
    description: str | None = None
    scheduled_start: datetime | None = None
    duration_minutes: int | None = Field(default=None, ge=15, le=1440)
    timezone: str | None = None
    waiting_room: bool | None = None
    host_video_on: bool | None = None
    participant_video_on: bool | None = None
    allow_transcription: bool | None = None
    chat_before_after: bool | None = None
    encryption: Literal["enhanced", "e2ee"] | None = None


class JoinRequest(BaseModel):
    display_name: str | None = Field(default=None, max_length=50)
    passcode: str | None = None
    invite_token: str | None = Field(
        default=None, description="The `?pwd=` value; stands in for the passcode."
    )


class ParticipantOut(BaseModel):
    """Roster entry. `session_id` is intentionally absent — it authorizes WS
    frames (§5.2) and is returned only to its owner by `join`."""

    id: str
    meeting_id: str
    user_id: str | None = None
    display_name: str
    role: str
    is_muted: bool
    is_video_on: bool
    is_hand_raised: bool
    joined_at: datetime
    left_at: datetime | None = None


class ParticipantUpdate(BaseModel):
    is_muted: bool | None = None
    is_video_on: bool | None = None
    is_hand_raised: bool | None = None


class JoinResponse(BaseModel):
    session_id: str = Field(description="Server-minted UUID; authorizes WS frames.")
    participant: ParticipantOut
    meeting: MeetingOut
    ice_servers: list[dict[str, Any]] = Field(description="§5.5 shape.")
    max_participants: int


class ChatMessageOut(BaseModel):
    id: str
    meeting_id: str
    participant_id: str
    display_name: str
    body: str
    sent_at: datetime


class ChatMessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)
    session_id: str = Field(description="Identifies the sending participant.")
