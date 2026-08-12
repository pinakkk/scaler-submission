"""User and preferences wire contracts (§4, §6.8)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    avatar_url: str | None = None
    personal_meeting_id: str
    personal_meeting_id_display: str = Field(description="`383 555 3861` form.")
    plan: str
    is_guest: bool
    created_at: datetime


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=50)
    avatar_url: str | None = None


class PreferencesOut(BaseModel):
    user_id: str
    theme: str
    mute_on_join: bool
    video_off_on_join: bool
    gallery_size: int
    mirror_video: bool
    always_show_controls: bool
    audio_input_id: str | None = None
    audio_output_id: str | None = None
    video_input_id: str | None = None
    updated_at: datetime


class PreferencesUpdate(BaseModel):
    """PUT body. Every field optional so the Settings modal can PATCH-like
    upsert one pane at a time without echoing the whole object back."""

    theme: Literal["classic", "bloom", "agave", "rose"] | None = None
    mute_on_join: bool | None = None
    video_off_on_join: bool | None = None
    gallery_size: Literal[9, 25] | None = None
    mirror_video: bool | None = None
    always_show_controls: bool | None = None
    audio_input_id: str | None = None
    audio_output_id: str | None = None
    video_input_id: str | None = None
