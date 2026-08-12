"""Meeting lifecycle: create, list, edit, cancel, start, end, lookup (§4, §5.4).

The state machine lives here as an explicit transition table, never in a router
and never on the client (§3.2). Everything returned to the HTTP layer is a
plain dict or dataclass — SQLModel table objects never leave this layer (§1.3).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any, Final

from sqlmodel import Session, func, select

from app.models import (
    ENCRYPTION_MODES,
    ROLE_HOST,
    STATUS_CANCELLED,
    STATUS_ENDED,
    STATUS_LIVE,
    STATUS_SCHEDULED,
    Meeting,
    MeetingInvitee,
    Participant,
    User,
    utcnow,
)
from app.services.errors import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
)
from app.services.security import (
    format_meeting_number,
    generate_invite_token,
    generate_passcode,
    insert_with_unique_number,
)

# --- Limits ------------------------------------------------------------------
MAX_TOPIC_LENGTH: Final = 200
MIN_DURATION_MINUTES: Final = 15
MAX_DURATION_MINUTES: Final = 1440
BASIC_PLAN_DURATION_CAP: Final = 40  # §6.6 — basic plans clamp to 40 minutes
DEFAULT_PAGE_LIMIT: Final = 20
MAX_PAGE_LIMIT: Final = 100

# §5.4. Legal target states, keyed by current state. Terminal states map to an
# empty set rather than being absent, so "unknown state" and "no way out" are
# distinguishable failures.
TRANSITIONS: Final[dict[str, frozenset[str]]] = {
    STATUS_SCHEDULED: frozenset({STATUS_LIVE, STATUS_CANCELLED}),
    # ended -> live is deliberate: §5.4 shows "host rejoins (ended -> live)".
    STATUS_LIVE: frozenset({STATUS_ENDED}),
    STATUS_ENDED: frozenset({STATUS_LIVE}),
    STATUS_CANCELLED: frozenset(),
}


class InvalidStateTransition(ConflictError):
    """Illegal move in the §5.4 state machine. Maps to HTTP 409."""

    code = "INVALID_STATE_TRANSITION"
    message = "The meeting is not in a state that allows this action."

    def __init__(self, current: str, target: str) -> None:
        super().__init__(
            f"Cannot move a meeting from '{current}' to '{target}'.",
            details={
                "from": current,
                "to": target,
                "allowed": sorted(allowed_targets(current)),
            },
        )


class MeetingNotFound(NotFoundError):
    code = "MEETING_NOT_FOUND"
    message = "No meeting with that ID."


def allowed_targets(current: str) -> frozenset[str]:
    """Legal next states. Unknown states have no legal moves."""
    return TRANSITIONS.get(current, frozenset())


def can_transition(current: str, target: str) -> bool:
    return target in allowed_targets(current)


def assert_can_transition(current: str, target: str) -> None:
    if not can_transition(current, target):
        raise InvalidStateTransition(current, target)


# --- Serialization -----------------------------------------------------------
# Table objects stop here (§1.3). These builders are the only place a Meeting
# row is turned into wire data, so there is exactly one place to audit for leaks.


def _host_summary(session: Session, host_id: str) -> dict[str, Any] | None:
    host = session.get(User, host_id)
    if host is None:
        return None
    return {"id": host.id, "name": host.name, "avatar_url": host.avatar_url}


def active_participant_count(session: Session, meeting_id: str) -> int:
    """`left_at IS NULL` means currently present (§3.2)."""
    return (
        session.exec(
            select(func.count())
            .select_from(Participant)
            .where(Participant.meeting_id == meeting_id, Participant.left_at.is_(None))
        ).one()
    )


def serialize_meeting(session: Session, meeting: Meeting) -> dict[str, Any]:
    """Full detail view. Includes passcode and invite_token — callers must have
    already authorized the requester (host or an active participant)."""
    return {
        "id": meeting.id,
        "meeting_number": meeting.meeting_number,
        "meeting_number_display": format_meeting_number(meeting.meeting_number),
        "host_id": meeting.host_id,
        "host": _host_summary(session, meeting.host_id),
        "topic": meeting.topic,
        "description": meeting.description,
        "scheduled_start": meeting.scheduled_start,
        "duration_minutes": meeting.duration_minutes,
        "timezone": meeting.timezone,
        "passcode": meeting.passcode,
        "invite_token": meeting.invite_token,
        "status": meeting.status,
        "use_pmi": meeting.use_pmi,
        "waiting_room": meeting.waiting_room,
        "host_video_on": meeting.host_video_on,
        "participant_video_on": meeting.participant_video_on,
        "allow_transcription": meeting.allow_transcription,
        "chat_before_after": meeting.chat_before_after,
        "encryption": meeting.encryption,
        "started_at": meeting.started_at,
        "ended_at": meeting.ended_at,
        "created_at": meeting.created_at,
        "is_instant": meeting.scheduled_start is None,
        "participant_count": active_participant_count(session, meeting.id),
    }


def serialize_lookup(meeting: Meeting) -> dict[str, Any]:
    """The §4 pre-join probe. **Unauthenticated** — existence, topic, and
    whether a passcode is needed, and nothing else.

    Explicitly absent: invite_token, passcode, host identity, roster,
    participant counts, meeting id. The join page needs to render a topic before
    asking for a passcode; it does not need anything below. Built from literal
    keys rather than by filtering `serialize_meeting`, so a column added later
    cannot silently start leaking here.
    """
    return {
        "meeting_number": meeting.meeting_number,
        "topic": meeting.topic,
        "status": meeting.status,
        "passcode_required": bool(meeting.passcode),
    }


# --- Queries -----------------------------------------------------------------


def get_by_number(session: Session, meeting_number: str) -> Meeting:
    """Fetch by the 11-digit number, tolerating the spaced display form."""
    normalized = normalize_meeting_number(meeting_number)
    meeting = session.exec(
        select(Meeting).where(Meeting.meeting_number == normalized)
    ).first()
    if meeting is None:
        raise MeetingNotFound(details={"meeting_number": normalized})
    return meeting


def normalize_meeting_number(raw: str) -> str:
    """`895 9025 0750` / `895-9025-0750` -> `89590250750` (§6.4 strips spaces)."""
    return "".join(ch for ch in raw if ch.isdigit())


def get_detail(session: Session, meeting_number: str, viewer: User) -> dict[str, Any]:
    """Detail for a host or an authenticated participant (§4: session/guest).

    A guest who has not joined must not be able to read the passcode out of a
    detail call, so non-hosts are required to have a participant row.
    """
    meeting = get_by_number(session, meeting_number)
    if meeting.host_id != viewer.id:
        has_joined = session.exec(
            select(Participant.id).where(
                Participant.meeting_id == meeting.id,
                Participant.user_id == viewer.id,
            )
        ).first()
        if has_joined is None:
            raise ForbiddenError(
                "You are not a participant of this meeting.",
                code="NOT_A_PARTICIPANT",
            )
    return serialize_meeting(session, meeting)


def lookup(session: Session, meeting_number: str) -> dict[str, Any]:
    """Unauthenticated pre-join probe (§4)."""
    meeting = get_by_number(session, meeting_number)
    if meeting.status == STATUS_CANCELLED:
        # A cancelled meeting is indistinguishable from a nonexistent one to an
        # anonymous caller — there is nothing left to join.
        raise MeetingNotFound(details={"meeting_number": meeting.meeting_number})
    return serialize_lookup(meeting)


def _as_naive_utc(value: datetime) -> datetime:
    """Match the naive-UTC storage convention in `models.base.utcnow`."""
    if value.tzinfo is not None:
        return value.astimezone(UTC).replace(tzinfo=None)
    return value


def list_for_host(
    session: Session,
    host: User,
    *,
    filter_: str = "upcoming",
    date: str | None = None,
    limit: int = DEFAULT_PAGE_LIMIT,
    cursor: str | None = None,
) -> dict[str, Any]:
    """List the host's meetings (§4, plus §6.2's `filter=day`).

    Cursor pagination rather than offset: the day strip and the meetings list
    both re-query as rows mutate, and offsets skip or repeat rows under
    concurrent inserts. The cursor is the last row's id, applied as a tiebreak
    on the sort key so the ordering stays total.
    """
    limit = max(1, min(limit, MAX_PAGE_LIMIT))
    now = utcnow()
    stmt = select(Meeting).where(Meeting.host_id == host.id)

    if filter_ == "upcoming":
        stmt = stmt.where(
            Meeting.status.in_([STATUS_SCHEDULED, STATUS_LIVE]),
            Meeting.scheduled_start.is_not(None),
            Meeting.scheduled_start >= now,
        ).order_by(Meeting.scheduled_start.asc(), Meeting.id.asc())
    elif filter_ == "recent":
        stmt = stmt.where(Meeting.status == STATUS_ENDED).order_by(
            Meeting.ended_at.desc(), Meeting.id.desc()
        )
    elif filter_ == "day":
        if not date:
            raise ValidationError(
                "filter=day requires a `date` query parameter (YYYY-MM-DD).",
                details={"field": "date"},
            )
        try:
            day = datetime.strptime(date, "%Y-%m-%d")
        except ValueError as exc:
            raise ValidationError(
                "`date` must be formatted YYYY-MM-DD.", details={"field": "date"}
            ) from exc
        stmt = stmt.where(
            Meeting.status != STATUS_CANCELLED,
            Meeting.scheduled_start.is_not(None),
            Meeting.scheduled_start >= day,
            Meeting.scheduled_start < day + timedelta(days=1),
        ).order_by(Meeting.scheduled_start.asc(), Meeting.id.asc())
    elif filter_ == "all":
        stmt = stmt.order_by(Meeting.created_at.desc(), Meeting.id.desc())
    else:
        raise ValidationError(
            "`filter` must be one of: upcoming, recent, day, all.",
            details={"field": "filter", "value": filter_},
        )

    if cursor:
        stmt = _apply_cursor(stmt, filter_, session, cursor)

    # Over-fetch by one to learn whether another page exists without a COUNT.
    rows = session.exec(stmt.limit(limit + 1)).all()
    has_more = len(rows) > limit
    rows = rows[:limit]

    return {
        "items": [serialize_meeting(session, m) for m in rows],
        "next_cursor": rows[-1].id if (has_more and rows) else None,
        "has_more": has_more,
    }


def _apply_cursor(stmt, filter_: str, session: Session, cursor: str):
    """Resume after the row identified by `cursor` (a meeting id)."""
    anchor = session.get(Meeting, cursor)
    if anchor is None:
        raise ValidationError("Unknown pagination cursor.", details={"field": "cursor"})
    if filter_ in {"upcoming", "day"}:
        key = anchor.scheduled_start
        return stmt.where(
            (Meeting.scheduled_start > key)
            | ((Meeting.scheduled_start == key) & (Meeting.id > anchor.id))
        )
    if filter_ == "recent":
        key = anchor.ended_at
        return stmt.where(
            (Meeting.ended_at < key)
            | ((Meeting.ended_at == key) & (Meeting.id < anchor.id))
        )
    key = anchor.created_at
    return stmt.where(
        (Meeting.created_at < key)
        | ((Meeting.created_at == key) & (Meeting.id < anchor.id))
    )


# --- Mutations ---------------------------------------------------------------


def _validate_topic(topic: str) -> str:
    topic = topic.strip()
    if not topic:
        raise ValidationError("Topic is required.", details={"field": "topic"})
    if len(topic) > MAX_TOPIC_LENGTH:
        raise ValidationError(
            f"Topic must be {MAX_TOPIC_LENGTH} characters or fewer.",
            details={"field": "topic"},
        )
    return topic


def _resolve_duration(duration: int, plan: str) -> tuple[int, bool]:
    """Bound the duration and apply the basic-plan cap (§6.6).

    Returns `(duration, was_clamped)` — the caller surfaces the clamp so the UI
    can show the amber plan-limit banner instead of silently shortening.
    """
    if duration < MIN_DURATION_MINUTES or duration > MAX_DURATION_MINUTES:
        raise ValidationError(
            f"Duration must be between {MIN_DURATION_MINUTES} and "
            f"{MAX_DURATION_MINUTES} minutes.",
            details={"field": "duration_minutes"},
        )
    if plan == "basic" and duration > BASIC_PLAN_DURATION_CAP:
        return BASIC_PLAN_DURATION_CAP, True
    return duration, False


def create_meeting(
    session: Session,
    host: User,
    *,
    topic: str | None = None,
    description: str | None = None,
    scheduled_start: datetime | None = None,
    duration_minutes: int = BASIC_PLAN_DURATION_CAP,
    timezone: str = "UTC",
    use_pmi: bool = False,
    waiting_room: bool = True,
    host_video_on: bool = True,
    participant_video_on: bool = True,
    allow_transcription: bool = False,
    chat_before_after: bool = True,
    encryption: str = "enhanced",
    invitees: list[str] | None = None,
) -> dict[str, Any]:
    """Create an instant (`scheduled_start=None`) or scheduled meeting (§4, §5.4).

    An instant meeting is born `live`: §5.4 shows `POST /meetings (instant)`
    pointing straight at the live state, and the client redirects into the room
    immediately, so there is no scheduled phase to occupy.
    """
    topic = _validate_topic(topic or f"{host.name}'s Zoom Meeting")

    if scheduled_start is not None:
        scheduled_start = _as_naive_utc(scheduled_start)
        if scheduled_start <= utcnow():
            raise ValidationError(
                "Scheduled start must be in the future.",
                details={"field": "scheduled_start"},
            )

    duration_minutes, clamped = _resolve_duration(duration_minutes, host.plan)

    if encryption not in ENCRYPTION_MODES:
        raise ValidationError(
            "`encryption` must be 'enhanced' or 'e2ee'.",
            details={"field": "encryption"},
        )

    is_instant = scheduled_start is None
    status = STATUS_LIVE if is_instant else STATUS_SCHEDULED
    now = utcnow()

    common = {
        "host_id": host.id,
        "topic": topic,
        "description": description,
        "scheduled_start": scheduled_start,
        "duration_minutes": duration_minutes,
        "timezone": timezone,
        "passcode": generate_passcode(),
        "invite_token": generate_invite_token(),
        "status": status,
        "use_pmi": use_pmi,
        "waiting_room": waiting_room,
        "host_video_on": host_video_on,
        "participant_video_on": participant_video_on,
        "allow_transcription": allow_transcription,
        "chat_before_after": chat_before_after,
        "encryption": encryption,
        "started_at": now if is_instant else None,
    }

    if use_pmi:
        # The PMI is fixed per §3.2, so there is nothing to retry — a collision
        # here would mean the host already has a live meeting on their PMI.
        meeting = Meeting(meeting_number=host.personal_meeting_id, **common)
        session.add(meeting)
        session.flush()
    else:
        meeting = insert_with_unique_number(
            session, lambda number: Meeting(meeting_number=number, **common)
        )

    for email in invitees or []:
        email = email.strip()
        if email:
            session.add(MeetingInvitee(meeting_id=meeting.id, email=email))

    session.commit()
    session.refresh(meeting)

    payload = serialize_meeting(session, meeting)
    payload["duration_clamped"] = clamped
    return payload


def _require_host(meeting: Meeting, user: User) -> None:
    if meeting.host_id != user.id:
        raise ForbiddenError(
            "Only the meeting host can perform this action.", code="NOT_HOST"
        )


def update_meeting(
    session: Session, meeting_number: str, host: User, changes: dict[str, Any]
) -> dict[str, Any]:
    """Edit a scheduled meeting (§4, host-only).

    Only scheduled meetings are editable — retconning the topic or start time of
    a meeting that already ran would corrupt the history the Previous tab shows.
    """
    meeting = get_by_number(session, meeting_number)
    _require_host(meeting, host)

    if meeting.status != STATUS_SCHEDULED:
        raise ConflictError(
            "Only a scheduled meeting can be edited.",
            code="MEETING_NOT_EDITABLE",
            details={"status": meeting.status},
        )

    if "topic" in changes and changes["topic"] is not None:
        meeting.topic = _validate_topic(changes["topic"])
    if "description" in changes:
        meeting.description = changes["description"]
    if "scheduled_start" in changes and changes["scheduled_start"] is not None:
        start = _as_naive_utc(changes["scheduled_start"])
        if start <= utcnow():
            raise ValidationError(
                "Scheduled start must be in the future.",
                details={"field": "scheduled_start"},
            )
        meeting.scheduled_start = start
    if "duration_minutes" in changes and changes["duration_minutes"] is not None:
        meeting.duration_minutes, _ = _resolve_duration(
            changes["duration_minutes"], host.plan
        )
    for field in (
        "timezone",
        "waiting_room",
        "host_video_on",
        "participant_video_on",
        "allow_transcription",
        "chat_before_after",
    ):
        if changes.get(field) is not None:
            setattr(meeting, field, changes[field])
    if changes.get("encryption") is not None:
        if changes["encryption"] not in ENCRYPTION_MODES:
            raise ValidationError(
                "`encryption` must be 'enhanced' or 'e2ee'.",
                details={"field": "encryption"},
            )
        meeting.encryption = changes["encryption"]

    session.add(meeting)
    session.commit()
    session.refresh(meeting)
    return serialize_meeting(session, meeting)


def cancel_meeting(session: Session, meeting_number: str, host: User) -> dict[str, Any]:
    """`scheduled` -> `cancelled` (§5.4). Illegal from any other state."""
    meeting = get_by_number(session, meeting_number)
    _require_host(meeting, host)
    assert_can_transition(meeting.status, STATUS_CANCELLED)
    meeting.status = STATUS_CANCELLED
    session.add(meeting)
    session.commit()
    session.refresh(meeting)
    return serialize_meeting(session, meeting)


def start_meeting(session: Session, meeting_number: str, host: User) -> dict[str, Any]:
    """`scheduled | ended` -> `live` (§4, §5.4)."""
    meeting = get_by_number(session, meeting_number)
    _require_host(meeting, host)
    assert_can_transition(meeting.status, STATUS_LIVE)
    meeting.status = STATUS_LIVE
    meeting.started_at = utcnow()
    # Restarting an ended meeting clears the previous end stamp so
    # `ended_at IS NOT NULL` stays a reliable "this meeting is over" predicate.
    meeting.ended_at = None
    session.add(meeting)
    session.commit()
    session.refresh(meeting)
    return serialize_meeting(session, meeting)


def end_meeting(session: Session, meeting_number: str, host: User) -> dict[str, Any]:
    """`live` -> `ended`, evicting every active participant (§4, §5.4).

    Eviction is part of the transition, not a follow-up: an `ended` meeting with
    rows still showing `left_at IS NULL` would report phantom participants
    forever, since nothing else will ever close them.
    """
    meeting = get_by_number(session, meeting_number)
    _require_host(meeting, host)
    assert_can_transition(meeting.status, STATUS_ENDED)

    now = utcnow()
    meeting.status = STATUS_ENDED
    meeting.ended_at = now
    session.add(meeting)

    active = session.exec(
        select(Participant).where(
            Participant.meeting_id == meeting.id, Participant.left_at.is_(None)
        )
    ).all()
    for participant in active:
        participant.left_at = now
        participant.connection_id = None
        session.add(participant)

    session.commit()
    session.refresh(meeting)
    return serialize_meeting(session, meeting)


__all__ = [
    "BASIC_PLAN_DURATION_CAP",
    "DEFAULT_PAGE_LIMIT",
    "MAX_PAGE_LIMIT",
    "TRANSITIONS",
    "InvalidStateTransition",
    "MeetingNotFound",
    "ROLE_HOST",
    "active_participant_count",
    "allowed_targets",
    "assert_can_transition",
    "can_transition",
    "cancel_meeting",
    "create_meeting",
    "end_meeting",
    "get_by_number",
    "get_detail",
    "list_for_host",
    "lookup",
    "normalize_meeting_number",
    "serialize_lookup",
    "serialize_meeting",
    "start_meeting",
    "update_meeting",
]
