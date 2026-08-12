"""`users` table (§3.1, §3.2).

Google OAuth users carry a `google_id` and `is_guest=False`. Guests get a real
row too — synthetic email, no `google_id` — so `participants.user_id` is always
populated and analytics stay uniform (§3.2).
"""

from __future__ import annotations

from datetime import datetime

from sqlmodel import Field, SQLModel

from app.models.base import new_id, utcnow


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: str = Field(default_factory=new_id, primary_key=True)
    google_id: str | None = Field(default=None, unique=True, index=True)
    email: str = Field(unique=True, index=True)
    name: str
    avatar_url: str | None = Field(default=None)
    # 11-digit personal meeting id, minted at signup (§3.2).
    personal_meeting_id: str = Field(unique=True, index=True)
    plan: str = Field(default="basic")  # basic | pro
    is_guest: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utcnow)
