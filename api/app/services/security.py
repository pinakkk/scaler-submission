"""Credential generation: meeting numbers, passcodes, invite tokens (§3.3).

Kept in the service layer, not on the model: generating a meeting number needs
DB access to detect a unique collision, and models must stay ignorant of
sessions (§1.3).
"""

from __future__ import annotations

import secrets
from typing import Final

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.services.errors import AppError

MEETING_NUMBER_DIGITS: Final = 11
MAX_GENERATION_ATTEMPTS: Final = 5

# Passcode alphabet: mixed case + digits, minus the visually ambiguous
# 0/O/1/l/I. The code is read off a screen and typed by hand (§6.3).
_PASSCODE_ALPHABET: Final = (
    "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
)
PASSCODE_LENGTH: Final = 6

_FIRST_DIGIT_CHOICES: Final = 9  # 1..9
_REMAINDER_UPPER_BOUND: Final = 10 ** (MEETING_NUMBER_DIGITS - 1)


class MeetingNumberExhausted(AppError):
    """Ran out of attempts finding a free meeting number (§3.3)."""

    status_code = 503
    code = "MEETING_NUMBER_UNAVAILABLE"
    message = "Could not allocate a meeting number. Please retry."


def generate_meeting_number() -> str:
    """One candidate 11-digit meeting number.

    `secrets.randbelow` (CSPRNG), never a sequential counter — a counter leaks
    volume and is trivially enumerable (§3.3). The first digit is drawn from
    1-9 separately so a leading zero is impossible by construction rather than
    by rejection-sampling a value that would silently become a 10-digit string.
    """
    first = secrets.randbelow(_FIRST_DIGIT_CHOICES) + 1
    rest = secrets.randbelow(_REMAINDER_UPPER_BOUND)
    number = f"{first}{rest:0{MEETING_NUMBER_DIGITS - 1}d}"
    assert len(number) == MEETING_NUMBER_DIGITS and number[0] != "0"
    return number


def format_meeting_number(number: str) -> str:
    """`89590250750` -> `895 9025 0750` (§3.1 display form)."""
    if len(number) != MEETING_NUMBER_DIGITS:
        return number
    return f"{number[:3]} {number[3:7]} {number[7:]}"


def allocate_meeting_number(
    session: Session, *, max_attempts: int = MAX_GENERATION_ATTEMPTS
) -> str:
    """Return a meeting number not already present in `meetings` or `users`.

    Checks both tables because a personal meeting id shares the same number
    space and `use_pmi=True` meetings reuse it verbatim — a collision there
    would make two different rooms indistinguishable by number.

    Retries up to `max_attempts` (§3.3). Note this is a pre-check, not a
    guarantee: the unique index is the real arbiter, so callers that insert
    should route through `insert_with_unique_number`.
    """
    from app.models import Meeting, User

    for _ in range(max_attempts):
        candidate = generate_meeting_number()
        taken = session.exec(
            select(Meeting.id).where(Meeting.meeting_number == candidate)
        ).first()
        if taken is not None:
            continue
        pmi_taken = session.exec(
            select(User.id).where(User.personal_meeting_id == candidate)
        ).first()
        if pmi_taken is None:
            return candidate
    raise MeetingNumberExhausted()


def insert_with_unique_number(
    session: Session, build, *, max_attempts: int = MAX_GENERATION_ATTEMPTS
):
    """Insert a row whose meeting number must be unique, retrying on collision.

    `build(number)` returns the unpersisted row. The unique index — not the
    pre-check in `allocate_meeting_number` — is what actually decides, so an
    IntegrityError is a legitimate outcome to retry rather than an error to
    surface. Two concurrent creates that draw the same number is precisely the
    race §3.3's "retry on unique-constraint collision" describes.
    """
    last_error: IntegrityError | None = None
    for _ in range(max_attempts):
        number = generate_meeting_number()
        row = build(number)
        session.add(row)
        try:
            session.flush()
        except IntegrityError as exc:
            last_error = exc
            session.rollback()
            continue
        return row
    raise MeetingNumberExhausted(
        details={
            "attempts": max_attempts,
            "reason": str(last_error) if last_error else "",
        }
    )


def generate_passcode() -> str:
    """Short human-typed code shown in the invitation (§6.3)."""
    return "".join(secrets.choice(_PASSCODE_ALPHABET) for _ in range(PASSCODE_LENGTH))


def generate_invite_token() -> str:
    """The URL-safe `?pwd=` value. Deliberately distinct from `passcode` (§3.2):
    long and unguessable, since it grants entry without any further check."""
    return secrets.token_urlsafe(24)
