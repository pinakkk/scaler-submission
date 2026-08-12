"""Current-user profile and preferences (§4, §6.8)."""

from __future__ import annotations

from typing import Any

from sqlmodel import Session

from app.models import GALLERY_SIZES, THEMES, User, UserPreferences, utcnow
from app.services.auth_service import normalize_display_name
from app.services.errors import ValidationError
from app.services.security import format_meeting_number


def serialize_user(user: User) -> dict[str, Any]:
    """Public profile shape. No `google_id` — it is an identity-provider key,
    not a display attribute, and nothing on the client needs it."""
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "avatar_url": user.avatar_url,
        "personal_meeting_id": user.personal_meeting_id,
        "personal_meeting_id_display": format_meeting_number(user.personal_meeting_id),
        "plan": user.plan,
        "is_guest": user.is_guest,
        "created_at": user.created_at,
    }


def update_profile(
    session: Session, user: User, changes: dict[str, Any]
) -> dict[str, Any]:
    """Update display name / avatar (§4)."""
    if changes.get("name") is not None:
        user.name = normalize_display_name(changes["name"])
    if "avatar_url" in changes:
        user.avatar_url = changes["avatar_url"]
    session.add(user)
    session.commit()
    session.refresh(user)
    return serialize_user(user)


def serialize_preferences(prefs: UserPreferences) -> dict[str, Any]:
    return {
        "user_id": prefs.user_id,
        "theme": prefs.theme,
        "mute_on_join": prefs.mute_on_join,
        "video_off_on_join": prefs.video_off_on_join,
        "gallery_size": prefs.gallery_size,
        "mirror_video": prefs.mirror_video,
        "always_show_controls": prefs.always_show_controls,
        "audio_input_id": prefs.audio_input_id,
        "audio_output_id": prefs.audio_output_id,
        "video_input_id": prefs.video_input_id,
        "updated_at": prefs.updated_at,
    }


def get_preferences(session: Session, user: User) -> dict[str, Any]:
    """Read preferences, serving model defaults when no row exists (§3.2).

    Deliberately does not create the row: a GET must not write, and the Settings
    modal reads on every open.
    """
    prefs = session.get(UserPreferences, user.id)
    if prefs is None:
        prefs = UserPreferences(user_id=user.id)  # unpersisted defaults
    return serialize_preferences(prefs)


def upsert_preferences(
    session: Session, user: User, changes: dict[str, Any]
) -> dict[str, Any]:
    """Create-or-update the preferences row from the Settings modal (§4, §6.8)."""
    if changes.get("theme") is not None and changes["theme"] not in THEMES:
        raise ValidationError(
            f"`theme` must be one of: {', '.join(sorted(THEMES))}.",
            details={"field": "theme"},
        )
    gallery_size = changes.get("gallery_size")
    if gallery_size is not None and gallery_size not in GALLERY_SIZES:
        raise ValidationError(
            "`gallery_size` must be 9 or 25.", details={"field": "gallery_size"}
        )

    prefs = session.get(UserPreferences, user.id)
    if prefs is None:
        prefs = UserPreferences(user_id=user.id)

    for field in (
        "theme",
        "mute_on_join",
        "video_off_on_join",
        "gallery_size",
        "mirror_video",
        "always_show_controls",
    ):
        if changes.get(field) is not None:
            setattr(prefs, field, changes[field])
    # Device ids are explicitly nullable — an explicit null means "use the
    # system default", so presence in the payload matters, not truthiness.
    for field in ("audio_input_id", "audio_output_id", "video_input_id"):
        if field in changes:
            setattr(prefs, field, changes[field])

    prefs.updated_at = utcnow()
    session.add(prefs)
    session.commit()
    session.refresh(prefs)
    return serialize_preferences(prefs)


__all__ = [
    "get_preferences",
    "serialize_preferences",
    "serialize_user",
    "update_profile",
    "upsert_preferences",
]
