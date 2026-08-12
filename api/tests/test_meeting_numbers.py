"""Meeting-number generation (§3.3, §11 — explicitly graded)."""

from __future__ import annotations

import pytest
from sqlmodel import Session, select

from app.models import Meeting, User
from app.services import security
from app.services.security import (
    MAX_GENERATION_ATTEMPTS,
    MEETING_NUMBER_DIGITS,
    MeetingNumberExhausted,
    allocate_meeting_number,
    format_meeting_number,
    generate_meeting_number,
    insert_with_unique_number,
)


def test_number_is_eleven_digits_without_a_leading_zero() -> None:
    for _ in range(2000):
        number = generate_meeting_number()
        assert len(number) == MEETING_NUMBER_DIGITS
        assert number.isdigit()
        assert number[0] != "0", f"leading zero in {number}"


def test_numbers_are_not_sequential() -> None:
    """A counter would leak volume and be trivially enumerable (§3.3)."""
    numbers = [int(generate_meeting_number()) for _ in range(50)]
    deltas = {b - a for a, b in zip(numbers, numbers[1:], strict=False)}
    assert len(deltas) > 40, "generation looks sequential"


def test_first_digit_covers_one_through_nine() -> None:
    """Rejecting leading zeros must not narrow the space to a couple of digits."""
    seen = {generate_meeting_number()[0] for _ in range(3000)}
    assert seen == set("123456789")


def test_format_matches_the_display_form() -> None:
    assert format_meeting_number("89590250750") == "895 9025 0750"


def test_allocate_skips_a_taken_number(session: Session, host: User) -> None:
    """The generator retries rather than handing back a colliding number."""
    taken = generate_meeting_number()
    session.add(
        Meeting(
            meeting_number=taken,
            host_id=host.id,
            topic="Existing",
            passcode="abc123",
            invite_token="token-existing",
        )
    )
    session.commit()

    calls: list[str] = []
    free = generate_meeting_number()

    def fake_generate() -> str:
        calls.append("x")
        return taken if len(calls) == 1 else free

    original = security.generate_meeting_number
    security.generate_meeting_number = fake_generate
    try:
        assert allocate_meeting_number(session) == free
    finally:
        security.generate_meeting_number = original
    assert len(calls) == 2, "collision did not trigger a retry"


def test_allocate_also_avoids_personal_meeting_ids(session: Session, host: User) -> None:
    """PMIs share the number space; a collision would make two rooms
    indistinguishable by number."""
    calls: list[str] = []
    free = generate_meeting_number()

    def fake_generate() -> str:
        calls.append("x")
        return host.personal_meeting_id if len(calls) == 1 else free

    original = security.generate_meeting_number
    security.generate_meeting_number = fake_generate
    try:
        assert allocate_meeting_number(session) == free
    finally:
        security.generate_meeting_number = original


def test_allocate_gives_up_after_five_attempts(session: Session, host: User) -> None:
    """§3.3 caps retries at 5 — it must fail loudly, not loop forever."""
    collide = generate_meeting_number()
    session.add(
        Meeting(
            meeting_number=collide,
            host_id=host.id,
            topic="Existing",
            passcode="abc123",
            invite_token="token-collide",
        )
    )
    session.commit()

    attempts: list[str] = []

    def always_collide() -> str:
        attempts.append("x")
        return collide

    original = security.generate_meeting_number
    security.generate_meeting_number = always_collide
    try:
        with pytest.raises(MeetingNumberExhausted):
            allocate_meeting_number(session)
    finally:
        security.generate_meeting_number = original
    assert len(attempts) == MAX_GENERATION_ATTEMPTS


def test_insert_retries_on_a_forced_unique_collision(
    session: Session, host: User
) -> None:
    """The unique index — not the pre-check — is the real arbiter (§3.3).

    Forces the generator to return an already-persisted number first, so the
    INSERT genuinely violates `ix_meetings_number` and the retry path is what
    produces the row.
    """
    existing = generate_meeting_number()
    session.add(
        Meeting(
            meeting_number=existing,
            host_id=host.id,
            topic="First",
            passcode="abc123",
            invite_token="token-first",
        )
    )
    session.commit()

    free = generate_meeting_number()
    calls: list[str] = []

    def fake_generate() -> str:
        calls.append("x")
        return existing if len(calls) == 1 else free

    original = security.generate_meeting_number
    security.generate_meeting_number = fake_generate
    try:
        row = insert_with_unique_number(
            session,
            lambda number: Meeting(
                meeting_number=number,
                host_id=host.id,
                topic="Second",
                passcode="abc123",
                invite_token="token-second",
            ),
        )
        session.commit()
    finally:
        security.generate_meeting_number = original

    assert row.meeting_number == free
    assert len(calls) == 2, "the IntegrityError did not trigger a retry"

    persisted = session.exec(
        select(Meeting).where(Meeting.meeting_number == free)
    ).first()
    assert persisted is not None


def test_unique_index_rejects_a_duplicate_number(session: Session, host: User) -> None:
    """Prove the constraint the retry logic depends on actually exists."""
    import sqlalchemy.exc

    number = generate_meeting_number()
    for token in ("tok-a", "tok-b"):
        session.add(
            Meeting(
                meeting_number=number,
                host_id=host.id,
                topic="Dup",
                passcode="abc123",
                invite_token=token,
            )
        )
    with pytest.raises(sqlalchemy.exc.IntegrityError):
        session.commit()
    session.rollback()


def test_generated_passcodes_and_tokens_differ() -> None:
    """§3.2: different values, different threat models."""
    passcodes = {security.generate_passcode() for _ in range(200)}
    tokens = {security.generate_invite_token() for _ in range(200)}
    assert len(passcodes) > 190
    assert len(tokens) == 200
    assert not (passcodes & tokens)
