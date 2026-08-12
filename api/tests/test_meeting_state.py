"""Meeting state machine (§5.4, §11 — explicitly graded).

Covers the transition table exhaustively: every (from, to) pair in the product
of the four states is asserted either legal or illegal, so a future edit to
`TRANSITIONS` cannot quietly widen the machine.
"""

from __future__ import annotations

import itertools

import pytest
from sqlmodel import Session

from app.models import (
    STATUS_CANCELLED,
    STATUS_ENDED,
    STATUS_LIVE,
    STATUS_SCHEDULED,
    Meeting,
    Participant,
    User,
    utcnow,
)
from app.services.meeting_service import (
    TRANSITIONS,
    InvalidStateTransition,
    allowed_targets,
    can_transition,
    cancel_meeting,
    end_meeting,
    start_meeting,
)

ALL_STATES = [STATUS_SCHEDULED, STATUS_LIVE, STATUS_ENDED, STATUS_CANCELLED]

# §5.4, read off the diagram. This is the independent restatement the
# implementation is checked against — deliberately not imported from the app.
LEGAL_PAIRS = {
    (STATUS_SCHEDULED, STATUS_LIVE),  # POST /start (or host joins)
    (STATUS_SCHEDULED, STATUS_CANCELLED),  # DELETE
    (STATUS_LIVE, STATUS_ENDED),  # POST /end, or last participant + grace
    (STATUS_ENDED, STATUS_LIVE),  # host rejoins
}

ILLEGAL_PAIRS = [
    pair
    for pair in itertools.product(ALL_STATES, repeat=2)
    if pair not in LEGAL_PAIRS
]


@pytest.mark.parametrize(("source", "target"), sorted(LEGAL_PAIRS))
def test_legal_transitions_are_permitted(source: str, target: str) -> None:
    assert can_transition(source, target), f"{source} -> {target} should be legal"


@pytest.mark.parametrize(("source", "target"), ILLEGAL_PAIRS)
def test_illegal_transitions_are_rejected(source: str, target: str) -> None:
    """Includes every self-transition and every move out of a terminal state."""
    assert not can_transition(source, target), f"{source} -> {target} must be illegal"


def test_transition_table_covers_every_state() -> None:
    assert set(TRANSITIONS) == set(ALL_STATES)


def test_cancelled_is_terminal() -> None:
    assert allowed_targets(STATUS_CANCELLED) == frozenset()


def test_unknown_state_has_no_legal_moves() -> None:
    """A corrupted status must strand the row, not open the machine up."""
    assert allowed_targets("bogus") == frozenset()
    assert not can_transition("bogus", STATUS_LIVE)


# --- Through the service, on real rows ---------------------------------------


def _meeting(session: Session, host: User, status: str) -> Meeting:
    from app.services.security import generate_invite_token, generate_meeting_number

    now = utcnow()
    meeting = Meeting(
        meeting_number=generate_meeting_number(),
        host_id=host.id,
        topic="State Test",
        passcode="Ab3xy9",
        invite_token=generate_invite_token(),
        status=status,
        scheduled_start=now,
        started_at=now if status in {STATUS_LIVE, STATUS_ENDED} else None,
        ended_at=now if status == STATUS_ENDED else None,
    )
    session.add(meeting)
    session.commit()
    session.refresh(meeting)
    return meeting


def test_start_moves_scheduled_to_live(session: Session, host: User) -> None:
    meeting = _meeting(session, host, STATUS_SCHEDULED)
    result = start_meeting(session, meeting.meeting_number, host)
    assert result["status"] == STATUS_LIVE
    assert result["started_at"] is not None


def test_start_restarts_an_ended_meeting(session: Session, host: User) -> None:
    """§5.4 shows `ended -> live` when the host rejoins."""
    meeting = _meeting(session, host, STATUS_ENDED)
    result = start_meeting(session, meeting.meeting_number, host)
    assert result["status"] == STATUS_LIVE
    assert result["ended_at"] is None, "restart must clear the previous end stamp"


def test_start_on_a_live_meeting_is_a_conflict(session: Session, host: User) -> None:
    meeting = _meeting(session, host, STATUS_LIVE)
    with pytest.raises(InvalidStateTransition) as exc:
        start_meeting(session, meeting.meeting_number, host)
    assert exc.value.status_code == 409
    assert exc.value.code == "INVALID_STATE_TRANSITION"


def test_start_on_a_cancelled_meeting_is_a_conflict(
    session: Session, host: User
) -> None:
    meeting = _meeting(session, host, STATUS_CANCELLED)
    with pytest.raises(InvalidStateTransition):
        start_meeting(session, meeting.meeting_number, host)


def test_end_moves_live_to_ended(session: Session, host: User) -> None:
    meeting = _meeting(session, host, STATUS_LIVE)
    result = end_meeting(session, meeting.meeting_number, host)
    assert result["status"] == STATUS_ENDED
    assert result["ended_at"] is not None


def test_end_on_a_scheduled_meeting_is_a_conflict(session: Session, host: User) -> None:
    meeting = _meeting(session, host, STATUS_SCHEDULED)
    with pytest.raises(InvalidStateTransition):
        end_meeting(session, meeting.meeting_number, host)


def test_end_twice_is_a_conflict(session: Session, host: User) -> None:
    meeting = _meeting(session, host, STATUS_LIVE)
    end_meeting(session, meeting.meeting_number, host)
    with pytest.raises(InvalidStateTransition):
        end_meeting(session, meeting.meeting_number, host)


def test_cancel_moves_scheduled_to_cancelled(session: Session, host: User) -> None:
    meeting = _meeting(session, host, STATUS_SCHEDULED)
    assert cancel_meeting(session, meeting.meeting_number, host)["status"] == (
        STATUS_CANCELLED
    )


def test_cancel_on_a_live_meeting_is_a_conflict(session: Session, host: User) -> None:
    """A live meeting must be ended, not cancelled — cancelling would erase the
    fact that it ran."""
    meeting = _meeting(session, host, STATUS_LIVE)
    with pytest.raises(InvalidStateTransition):
        cancel_meeting(session, meeting.meeting_number, host)


def test_cancel_on_an_ended_meeting_is_a_conflict(session: Session, host: User) -> None:
    meeting = _meeting(session, host, STATUS_ENDED)
    with pytest.raises(InvalidStateTransition):
        cancel_meeting(session, meeting.meeting_number, host)


def test_conflict_details_name_the_allowed_targets(
    session: Session, host: User
) -> None:
    """The 409 body must tell the client what *would* have worked."""
    meeting = _meeting(session, host, STATUS_CANCELLED)
    with pytest.raises(InvalidStateTransition) as exc:
        start_meeting(session, meeting.meeting_number, host)
    details = exc.value.details
    assert details["from"] == STATUS_CANCELLED
    assert details["to"] == STATUS_LIVE
    assert details["allowed"] == []


def test_end_evicts_every_active_participant(
    session: Session, host: User, joiner: User
) -> None:
    """§4: `live -> ended, evict all`. Rows left open would report phantom
    participants forever, since nothing else closes them."""
    meeting = _meeting(session, host, STATUS_LIVE)
    for user in (host, joiner):
        session.add(
            Participant(
                meeting_id=meeting.id,
                user_id=user.id,
                display_name=user.name,
            )
        )
    session.commit()

    end_meeting(session, meeting.meeting_number, host)

    from sqlmodel import select

    rows = session.exec(
        select(Participant).where(Participant.meeting_id == meeting.id)
    ).all()
    assert len(rows) == 2
    assert all(p.left_at is not None for p in rows), "participants were not evicted"
    assert all(p.connection_id is None for p in rows)


def test_only_the_host_can_transition(
    session: Session, host: User, joiner: User
) -> None:
    meeting = _meeting(session, host, STATUS_SCHEDULED)
    from app.services.errors import ForbiddenError

    with pytest.raises(ForbiddenError):
        start_meeting(session, meeting.meeting_number, joiner)
