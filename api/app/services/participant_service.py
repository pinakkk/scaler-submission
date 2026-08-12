"""Join flow, roster, and participant lifecycle (§4, §5.1, §5.5).

`left_at IS NULL` is the single "currently present" predicate (§3.2); every
count and roster query here goes through it, and every exit path sets it.
"""

from __future__ import annotations

import secrets
from typing import Any, Final

from sqlmodel import Session, func, select

from app.models import (
    ROLE_HOST,
    ROLE_PARTICIPANT,
    STATUS_CANCELLED,
    STATUS_ENDED,
    STATUS_LIVE,
    Meeting,
    Participant,
    User,
    UserPreferences,
    utcnow,
)
from app.services.errors import ConflictError, ForbiddenError, NotFoundError
from app.services.ice import get_ice_servers
from app.services.meeting_service import get_by_number, serialize_meeting

# §5.1 — mesh is N(N-1)/2 connections and every client uploads N-1 streams;
# upstream bandwidth is the binding constraint. Beyond this we refuse rather
# than silently degrading.
MAX_MESH_PARTICIPANTS: Final = 6


class MeetingFull(ConflictError):
    code = "MEETING_FULL"
    message = "This meeting has reached its participant limit."


class MeetingNotJoinable(ConflictError):
    code = "MEETING_NOT_JOINABLE"
    message = "This meeting is not currently open to join."


class InvalidPasscode(ForbiddenError):
    code = "INVALID_PASSCODE"
    message = "That passcode is not correct."


class ParticipantNotFound(NotFoundError):
    code = "PARTICIPANT_NOT_FOUND"
    message = "No such participant."


def serialize_participant(participant: Participant) -> dict[str, Any]:
    """Roster view. `session_id` is deliberately absent — it is a bearer
    credential for WS frames (§3.2) and is returned only to its own owner by
    `join`, never in a list every other participant can read."""
    return {
        "id": participant.id,
        "meeting_id": participant.meeting_id,
        "user_id": participant.user_id,
        "display_name": participant.display_name,
        "role": participant.role,
        "is_muted": participant.is_muted,
        "is_video_on": participant.is_video_on,
        "is_hand_raised": participant.is_hand_raised,
        "joined_at": participant.joined_at,
        "left_at": participant.left_at,
    }


def _active_count(session: Session, meeting_id: str) -> int:
    return session.exec(
        select(func.count())
        .select_from(Participant)
        .where(Participant.meeting_id == meeting_id, Participant.left_at.is_(None))
    ).one()


def _initial_media_state(session: Session, user: User) -> tuple[bool, bool]:
    """Apply the user's saved join preferences (§3.2, §6.8).

    Returns `(is_muted, is_video_on)`. Absent preferences fall back to the
    model defaults rather than creating a row — preferences are created lazily
    on first save.
    """
    prefs = session.get(UserPreferences, user.id)
    if prefs is None:
        return False, True
    return prefs.mute_on_join, not prefs.video_off_on_join


def join_meeting(
    session: Session,
    meeting_number: str,
    *,
    user: User,
    display_name: str | None = None,
    passcode: str | None = None,
    invite_token: str | None = None,
) -> dict[str, Any]:
    """Validate entry, create a `participants` row, return the session (§4).

    A fresh row per join attempt, never an update of an old one — rejoining must
    stay auditable (§3.2). The returned `session_id` is what authorizes
    subsequent WebSocket frames (§5.2).
    """
    meeting = get_by_number(session, meeting_number)

    if meeting.status in {STATUS_ENDED, STATUS_CANCELLED}:
        raise MeetingNotJoinable(
            "This meeting has already ended.",
            details={"status": meeting.status},
        )

    is_host = meeting.host_id == user.id

    # The host bypasses the passcode: they own the meeting and can read the
    # passcode from the detail endpoint anyway, so requiring it adds friction
    # without adding a control.
    if not is_host:
        # A valid invite token stands in for the passcode — that is the whole
        # point of the `?pwd=` link (§3.2). Compared in constant time so the
        # endpoint cannot be used as an oracle.
        token_ok = bool(
            invite_token and secrets.compare_digest(invite_token, meeting.invite_token)
        )
        needs_passcode = not token_ok and bool(meeting.passcode)
        if needs_passcode and (
            not passcode or not secrets.compare_digest(passcode, meeting.passcode)
        ):
            raise InvalidPasscode()

    if _active_count(session, meeting.id) >= MAX_MESH_PARTICIPANTS:
        raise MeetingFull(details={"limit": MAX_MESH_PARTICIPANTS})

    # A scheduled meeting goes live the moment its host joins (§5.4: "POST
    # /start (or host joins)"), so the joiner does not have to press Start.
    if is_host and meeting.status != STATUS_LIVE:
        meeting.status = STATUS_LIVE
        meeting.started_at = utcnow()
        meeting.ended_at = None
        session.add(meeting)

    is_muted, is_video_on = _initial_media_state(session, user)

    participant = Participant(
        meeting_id=meeting.id,
        user_id=user.id,
        display_name=(display_name or user.name).strip() or user.name,
        role=ROLE_HOST if is_host else ROLE_PARTICIPANT,
        is_muted=is_muted,
        is_video_on=is_video_on,
    )
    session.add(participant)
    session.commit()
    session.refresh(participant)
    session.refresh(meeting)

    return {
        "session_id": participant.session_id,
        "participant": serialize_participant(participant),
        "meeting": serialize_meeting(session, meeting),
        "ice_servers": get_ice_servers(),
        "max_participants": MAX_MESH_PARTICIPANTS,
    }


def list_active(
    session: Session, meeting_number: str, viewer: User
) -> list[dict[str, Any]]:
    """Active roster (§4, participant-scoped)."""
    meeting = get_by_number(session, meeting_number)
    require_membership(session, meeting, viewer)
    rows = session.exec(
        select(Participant)
        .where(Participant.meeting_id == meeting.id, Participant.left_at.is_(None))
        .order_by(Participant.joined_at.asc())
    ).all()
    return [serialize_participant(p) for p in rows]


def require_membership(
    session: Session, meeting: Meeting, viewer: User
) -> Participant | None:
    """The viewer must host the meeting or hold a participant row in it."""
    if meeting.host_id == viewer.id:
        return None
    row = session.exec(
        select(Participant).where(
            Participant.meeting_id == meeting.id, Participant.user_id == viewer.id
        )
    ).first()
    if row is None:
        raise ForbiddenError(
            "You are not a participant of this meeting.", code="NOT_A_PARTICIPANT"
        )
    return row


def _get_participant(session: Session, participant_id: str) -> Participant:
    participant = session.get(Participant, participant_id)
    if participant is None:
        raise ParticipantNotFound()
    return participant


def update_participant(
    session: Session, participant_id: str, actor: User, changes: dict[str, Any]
) -> dict[str, Any]:
    """Mute/unmute, video toggle, hand raise (§4: self or host).

    Authorization is against the DB, never a client-declared role (§5.2).
    """
    participant = _get_participant(session, participant_id)
    meeting = session.get(Meeting, participant.meeting_id)
    if meeting is None:
        raise ParticipantNotFound()

    is_self = participant.user_id == actor.id
    is_host = meeting.host_id == actor.id
    if not (is_self or is_host):
        raise ForbiddenError(
            "You can only change your own state, or a participant's if you host.",
            code="NOT_SELF_OR_HOST",
        )

    for field in ("is_muted", "is_video_on", "is_hand_raised"):
        if changes.get(field) is not None:
            setattr(participant, field, bool(changes[field]))

    session.add(participant)
    session.commit()
    session.refresh(participant)
    return serialize_participant(participant)


def remove_participant(
    session: Session, participant_id: str, actor: User
) -> dict[str, Any]:
    """Host removes someone from the meeting (§4, §6.7).

    Removal is `left_at`, not a delete: the row is the audit record of that
    join, and the roster predicate already excludes closed rows.
    """
    participant = _get_participant(session, participant_id)
    meeting = session.get(Meeting, participant.meeting_id)
    if meeting is None:
        raise ParticipantNotFound()
    if meeting.host_id != actor.id:
        raise ForbiddenError(
            "Only the meeting host can remove a participant.", code="NOT_HOST"
        )
    if participant.user_id == actor.id:
        raise ConflictError(
            "The host cannot remove themselves; end the meeting instead.",
            code="CANNOT_REMOVE_SELF",
        )
    return mark_left(session, participant)


def leave_meeting(session: Session, session_id: str) -> dict[str, Any]:
    """Close the row identified by a `session_id` (self-service exit)."""
    participant = session.exec(
        select(Participant).where(Participant.session_id == session_id)
    ).first()
    if participant is None:
        raise ParticipantNotFound()
    return mark_left(session, participant)


def mark_left(session: Session, participant: Participant) -> dict[str, Any]:
    """Set `left_at` and drop the WS mapping. Idempotent — a second call on an
    already-closed row keeps the original timestamp rather than moving it, so
    the recorded session length stays truthful."""
    if participant.left_at is None:
        participant.left_at = utcnow()
    participant.connection_id = None
    session.add(participant)
    session.commit()
    session.refresh(participant)
    return serialize_participant(participant)


__all__ = [
    "MAX_MESH_PARTICIPANTS",
    "InvalidPasscode",
    "MeetingFull",
    "MeetingNotJoinable",
    "ParticipantNotFound",
    "require_membership",
    "join_meeting",
    "leave_meeting",
    "list_active",
    "mark_left",
    "remove_participant",
    "serialize_participant",
    "update_participant",
]
