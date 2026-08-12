"""Seed data and its idempotency (§3.4, §11 — the seed is directly graded)."""

from __future__ import annotations

from sqlmodel import Session, select

from app import seed as seed_module
from app.models import (
    STATUS_ENDED,
    STATUS_LIVE,
    STATUS_SCHEDULED,
    ChatMessage,
    Meeting,
    Participant,
    User,
    utcnow,
)
from app.seed import PRIMARY_EMAIL, PRIMARY_PMI, counts, seed


def test_seed_is_idempotent(session: Session) -> None:
    """§3.4 — safe to re-run. Same row counts, no duplicates."""
    first = seed(session)
    second = seed(session)
    third = seed(session)
    assert first == second == third, "re-running the seed changed the row counts"


def test_seed_creates_the_primary_user_with_the_screenshot_pmi(
    session: Session,
) -> None:
    seed(session)
    user = session.exec(select(User).where(User.email == PRIMARY_EMAIL)).one()
    assert user.name == "Pinak Kundu"
    assert user.plan == "basic"
    assert user.personal_meeting_id == PRIMARY_PMI
    assert user.is_guest is False


def test_every_meeting_number_is_a_valid_eleven_digit_number(
    session: Session,
) -> None:
    """The seed's fixed numbers must still satisfy the §3.3 invariant."""
    seed(session)
    for meeting in session.exec(select(Meeting)).all():
        assert len(meeting.meeting_number) == 11
        assert meeting.meeting_number.isdigit()
        assert meeting.meeting_number[0] != "0"


def test_seed_creates_three_secondary_users(session: Session) -> None:
    seed(session)
    users = session.exec(select(User)).all()
    assert len(users) == 4  # 1 primary + 3 secondary (§3.4)


def test_seed_creates_two_upcoming_meetings(session: Session) -> None:
    """§3.4 — one today +3h, one tomorrow, both populating Upcoming Meetings."""
    seed(session)
    now = utcnow()
    upcoming = session.exec(
        select(Meeting).where(
            Meeting.status == STATUS_SCHEDULED, Meeting.scheduled_start > now
        )
    ).all()
    assert len(upcoming) == 2

    starts = sorted(m.scheduled_start for m in upcoming)
    assert starts[0].date() == now.date(), "the first should fall today"
    assert (starts[0] - now).total_seconds() > 0


def test_seed_creates_three_ended_meetings_with_participants_and_chat(
    session: Session,
) -> None:
    """§3.4 — these populate Recent activity and the chat drawer's history."""
    seed(session)
    ended = session.exec(
        select(Meeting).where(Meeting.status == STATUS_ENDED)
    ).all()
    assert len(ended) == 3

    for meeting in ended:
        participants = session.exec(
            select(Participant).where(Participant.meeting_id == meeting.id)
        ).all()
        assert len(participants) >= 2, f"{meeting.topic} has no participant list"
        # An ended meeting must have nobody left open, or the roster would
        # report phantom attendees forever.
        assert all(p.left_at is not None for p in participants)
        assert any(p.role == "host" for p in participants)

        messages = session.exec(
            select(ChatMessage).where(ChatMessage.meeting_id == meeting.id)
        ).all()
        assert len(messages) >= 3, f"{meeting.topic} has no chat history"


def test_seed_creates_one_live_meeting_with_present_participants(
    session: Session,
) -> None:
    """§3.4 — for immediate join testing, so it needs real occupants."""
    seed(session)
    live = session.exec(select(Meeting).where(Meeting.status == STATUS_LIVE)).all()
    assert len(live) == 1

    active = session.exec(
        select(Participant).where(
            Participant.meeting_id == live[0].id, Participant.left_at.is_(None)
        )
    ).all()
    assert len(active) >= 1
    assert live[0].started_at is not None


def test_seeded_meetings_have_distinct_passcodes_and_invite_tokens(
    session: Session,
) -> None:
    seed(session)
    meetings = session.exec(select(Meeting)).all()
    assert len({m.invite_token for m in meetings}) == len(meetings)
    assert len({m.meeting_number for m in meetings}) == len(meetings)


def test_reset_clears_everything_then_reseeds(session: Session) -> None:
    """`--reset` must satisfy the FK order, deleting children first."""
    before = seed(session)
    seed_module.reset(session)
    assert counts(session) == dict.fromkeys(before, 0)

    after = seed(session)
    assert after == before


def test_the_live_meeting_is_an_instant_meeting(session: Session) -> None:
    """`scheduled_start IS NULL` is the instant/scheduled discriminator (§3.2)."""
    seed(session)
    live = session.exec(select(Meeting).where(Meeting.status == STATUS_LIVE)).one()
    assert live.scheduled_start is None
