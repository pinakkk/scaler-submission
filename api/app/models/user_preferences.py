"""`user_preferences` table (§3.1, §3.2).

One row per user, created lazily on first save, with the defaults below served
when no row exists. Only preferences that change *real* behaviour live here —
`mute_on_join` / `video_off_on_join` are read by the join flow and applied to
the initial `getUserMedia` track state; device ids become `deviceId`
constraints. Purely cosmetic toggles stay in localStorage.
"""

from __future__ import annotations

from datetime import datetime
from typing import Final

from sqlmodel import Field, SQLModel

from app.models.base import utcnow

THEMES: Final[frozenset[str]] = frozenset({"classic", "bloom", "agave", "rose"})
GALLERY_SIZES: Final[frozenset[int]] = frozenset({9, 25})


class UserPreferences(SQLModel, table=True):
    __tablename__ = "user_preferences"

    # PK *and* FK: one row per user, enforced by the schema rather than by code.
    user_id: str = Field(foreign_key="users.id", primary_key=True)
    theme: str = Field(default="classic")
    mute_on_join: bool = Field(default=False)
    video_off_on_join: bool = Field(default=False)
    gallery_size: int = Field(default=9)
    mirror_video: bool = Field(default=True)
    always_show_controls: bool = Field(default=False)
    audio_input_id: str | None = Field(default=None)
    audio_output_id: str | None = Field(default=None)
    video_input_id: str | None = Field(default=None)
    updated_at: datetime = Field(default_factory=utcnow)
