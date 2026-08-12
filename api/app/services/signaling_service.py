"""Business logic behind the WebSocket signaling protocol (§5.2).

`app.realtime` handles protocol only — framing, fan-out, socket lifecycle. Every
decision that requires the database lives here, per the §1.3 layering rule.

The one rule this module exists to enforce: **the server never trusts a
client-declared role** (§5.2). A `host.*` frame carries no credential of its own;
the only thing the client holds is a `session_id`, and every authorization below
resolves that back to a `participants` row and reads `role` off the database.
"""

from __future__ import annotations

from typing import Any

from sqlmodel import Session, select

from app.models import (
    ROLE_HOST,
    STATUS_CANCELLED,
    STATUS_ENDED,
    Meeting,
    Participant,
    utcnow,
)
from app.services.errors import ForbiddenError, NotFoundError
from app.services.meeting_service import (
    get_by_number,
    normalize_meeting_number,
    serialize_meeting,
)
from app.services.participant_service import (
    MAX_MESH_PARTICIPANTS,
    MeetingFull,
    MeetingNotJoinable,
    mark_left,
    serialize_participant,
)


class InvalidSession(ForbiddenError):
    """The `session_id` on the query string does not name an open participant row.

    Closed with WS code 4401 by the route (§5.2) rather than surfaced as HTTP —
    the socket is already upgraded by the time we can check.
    """

    code = "INVALID_SESSION"
    message = "That session is not valid for this meeting."


def authenticate(
    session: Session, meeting_number: str, session_id: str
) -> tuple[Meeting, Participant]:
    """Resolve `(meeting, participant)` for a connecting socket, or raise (§5.2).

    Four things must all hold, and each failure is deliberately reported as the
    same `InvalidSession` — an anonymous caller probing session ids must not be
    able to tell "wrong meeting" from "already left" from "no such session".
    """
    normalized = normalize_meeting_number(meeting_number)
    participant = session.exec(
        select(Participant).where(Participant.session_id == session_id)
    ).first()
    if participant is None:
        raise InvalidSession()

    meeting = session.get(Meeting, participant.meeting_id)
    if meeting is None or meeting.meeting_number != normalized:
        raise InvalidSession()

    # Status is checked before `left_at`, and the order matters: ending a meeting
    # evicts every row (§5.4), so a participant of an ended meeting always has
    # `left_at` set. Testing `left_at` first would report every such reconnect as
    # a bad session and the client could never tell "the meeting is over" from
    # "your credential is wrong" — the one case where the distinction is safe to
    # draw, since the caller has already proved it holds a real session here.
    if meeting.status in {STATUS_ENDED, STATUS_CANCELLED}:
        raise MeetingNotJoinable(
            "This meeting has already ended.", details={"status": meeting.status}
        )
    if participant.left_at is not None:
        raise InvalidSession()
    return meeting, participant


def bind_connection(
    session: Session, participant: Participant, connection_id: str
) -> None:
    """Record which live socket owns this participant row (§3.2)."""
    participant.connection_id = connection_id
    session.add(participant)
    session.commit()
    session.refresh(participant)


def release_connection(
    session: Session, participant_id: str, connection_id: str
) -> dict[str, Any] | None:
    """Close the participant row when its socket drops.

    Guarded on `connection_id`: a client that reconnects fast enough to bind a
    new socket before the old one's disconnect handler runs would otherwise have
    its fresh session closed by the stale handler. Returns the serialized row
    when this call actually closed it, else None — the caller only broadcasts
    `peer.left` for a real departure.
    """
    participant = session.get(Participant, participant_id)
    if participant is None or participant.connection_id != connection_id:
        return None
    return mark_left(session, participant)


def active_roster(session: Session, meeting_id: str) -> list[dict[str, Any]]:
    """Everyone currently present, oldest join first (§3.2's `left_at IS NULL`)."""
    rows = session.exec(
        select(Participant)
        .where(Participant.meeting_id == meeting_id, Participant.left_at.is_(None))
        .order_by(Participant.joined_at.asc())
    ).all()
    return [serialize_participant(p) for p in rows]


def room_snapshot(
    session: Session, meeting: Meeting, participant: Participant
) -> dict[str, Any]:
    """Payload for the `room.state` frame — the full snapshot (§5.2).

    Sent on connect *and* on every reconnect, because §5.6 requires the client to
    reconcile rather than assume its peer connections survived.
    """
    return {
        "participants": active_roster(session, meeting.id),
        "you": serialize_participant(participant),
        "meeting": serialize_meeting(session, meeting),
    }


def assert_room_has_space(session: Session, meeting_id: str) -> None:
    """§5.1 — refuse past `MAX_MESH_PARTICIPANTS` rather than degrading silently.

    Checked again here, not only at `POST /join`, because the socket is what
    actually consumes a mesh slot: a client could hold a join response for
    minutes before connecting, by which time the room may have filled.
    """
    present = len(
        session.exec(
            select(Participant.id).where(
                Participant.meeting_id == meeting_id, Participant.left_at.is_(None)
            )
        ).all()
    )
    if present > MAX_MESH_PARTICIPANTS:
        raise MeetingFull(details={"limit": MAX_MESH_PARTICIPANTS})


def apply_state_update(
    session: Session, participant_id: str, changes: dict[str, Any]
) -> dict[str, Any]:
    """`state.update` — a client changing its *own* mute/video/hand state (§5.2).

    Self-service only; the caller passes its own participant id, resolved from
    the socket's session, so there is nothing here a client can aim elsewhere.
    """
    participant = session.get(Participant, participant_id)
    if participant is None:
        raise NotFoundError("No such participant.", code="PARTICIPANT_NOT_FOUND")
    for field in ("is_muted", "is_video_on", "is_hand_raised"):
        if changes.get(field) is not None:
            setattr(participant, field, bool(changes[field]))
    session.add(participant)
    session.commit()
    session.refresh(participant)
    return serialize_participant(participant)


# --- Host authorization (§5.2) ------------------------------------------------


def require_host(session: Session, participant: Participant) -> Meeting:
    """Authorize a `host.*` frame against the database (§5.2).

    Two independent checks, because they can disagree: `participant.role` is the
    role stamped on this join, and `meeting.host_id` is ownership. Requiring both
    means a stale row from a meeting whose host changed cannot retain host tools.
    """
    meeting = session.get(Meeting, participant.meeting_id)
    if meeting is None:
        raise NotFoundError("No such meeting.", code="MEETING_NOT_FOUND")
    if participant.role != ROLE_HOST or meeting.host_id != participant.user_id:
        raise ForbiddenError(
            "Only the meeting host can perform this action.", code="NOT_HOST"
        )
    return meeting


def host_mute(
    session: Session, actor: Participant, target_id: str
) -> dict[str, Any]:
    """Host forces one participant muted. Authorized against the DB (§5.2).

    The row is updated here and the target is told to mute itself via
    `host.muted_you`; the actual microphone only stops on the target's client,
    so this write and that frame must always travel together.
    """
    require_host(session, actor)
    target = session.get(Participant, target_id)
    if target is None or target.meeting_id != actor.meeting_id:
        raise NotFoundError("No such participant.", code="PARTICIPANT_NOT_FOUND")
    target.is_muted = True
    session.add(target)
    session.commit()
    session.refresh(target)
    return serialize_participant(target)


def host_mute_all(session: Session, actor: Participant) -> list[dict[str, Any]]:
    """Mute everyone except the host (§6.7 drawer footer)."""
    require_host(session, actor)
    rows = session.exec(
        select(Participant).where(
            Participant.meeting_id == actor.meeting_id,
            Participant.left_at.is_(None),
            Participant.id != actor.id,
        )
    ).all()
    for row in rows:
        row.is_muted = True
        session.add(row)
    session.commit()
    return [serialize_participant(row) for row in rows]


def host_remove(
    session: Session, actor: Participant, target_id: str
) -> dict[str, Any]:
    """Host evicts a participant (§6.7). `left_at`, never a delete (§3.2)."""
    require_host(session, actor)
    target = session.get(Participant, target_id)
    if target is None or target.meeting_id != actor.meeting_id:
        raise NotFoundError("No such participant.", code="PARTICIPANT_NOT_FOUND")
    if target.id == actor.id:
        raise ForbiddenError(
            "The host cannot remove themselves; end the meeting instead.",
            code="CANNOT_REMOVE_SELF",
        )
    return mark_left(session, target)


def host_end_meeting(session: Session, actor: Participant) -> dict[str, Any]:
    """`live` -> `ended` from inside the room, evicting everyone (§5.4).

    Mirrors `meeting_service.end_meeting` but is driven by a socket session
    rather than a bearer token, so the End popover works for a guest-authored
    socket whose HTTP token may have expired mid-meeting.
    """
    meeting = require_host(session, actor)
    now = utcnow()
    meeting.status = STATUS_ENDED
    meeting.ended_at = now
    session.add(meeting)

    for row in session.exec(
        select(Participant).where(
            Participant.meeting_id == meeting.id, Participant.left_at.is_(None)
        )
    ).all():
        row.left_at = now
        row.connection_id = None
        session.add(row)

    session.commit()
    session.refresh(meeting)
    return serialize_meeting(session, meeting)


def get_meeting_by_number(session: Session, meeting_number: str) -> Meeting:
    return get_by_number(session, meeting_number)


__all__ = [
    "InvalidSession",
    "active_roster",
    "apply_state_update",
    "assert_room_has_space",
    "authenticate",
    "bind_connection",
    "get_meeting_by_number",
    "host_end_meeting",
    "host_mute",
    "host_mute_all",
    "host_remove",
    "release_connection",
    "require_host",
    "room_snapshot",
]
