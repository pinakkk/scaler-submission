"""Demo seed data (§3.4). Idempotent — safe to re-run.

    python -m app.seed          # seed (or top up) the configured database
    python -m app.seed --reset  # drop every seeded row first, then reseed

Idempotency is keyed on stable natural keys (email for users, a deterministic
per-meeting slug recorded in `description` would be fragile, so meetings are
keyed on `topic` + host instead). Re-running never duplicates and never
rewrites a row a demo may have already mutated.

Contents, per §3.4:
  - 1 primary user: Pinak Kundu, plan="basic", PMI 383 555 3861
  - 3 secondary users for participant lists
  - 2 upcoming scheduled meetings (today +3h, tomorrow)
  - 3 ended meetings with participants and chat history
  - 1 live meeting for immediate join testing
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timedelta
from typing import Any

from sqlmodel import Session, delete, select

from app.database import engine, init_db, session_scope
from app.models import (
    ROLE_HOST,
    ROLE_PARTICIPANT,
    STATUS_ENDED,
    STATUS_LIVE,
    STATUS_SCHEDULED,
    ChatMessage,
    Meeting,
    MeetingInvitee,
    Participant,
    User,
    UserPreferences,
    utcnow,
)
from app.services.security import generate_invite_token, generate_passcode

# --- Fixed identities --------------------------------------------------------
# §3.4 gives the primary user's PMI as "383 555 3861" — but that is 10 digits,
# while §3.1/§3.3 require PMIs and meeting numbers to be 11. The two statements
# cannot both hold. We keep the literal digits the screenshots show and pad to
# the required width with a trailing 0, so the schema invariant (11 digits, no
# leading zero) holds and the number still reads as the one in the screenshots.
PRIMARY_EMAIL = "pinak.kundu@example.com"
PRIMARY_PMI = "38355538610"  # displays as "383 555 3861 0" -> 383 5553 8610

PRIMARY_USER: dict[str, Any] = {
    "email": PRIMARY_EMAIL,
    "name": "Pinak Kundu",
    "avatar_url": None,
    "personal_meeting_id": PRIMARY_PMI,
    "plan": "basic",
    "is_guest": False,
    "google_id": "seed-google-pinak",
}

SECONDARY_USERS: list[dict[str, Any]] = [
    {
        "email": "arjun.mehta@example.com",
        "name": "Arjun Mehta",
        "personal_meeting_id": "41728890342",
        "google_id": "seed-google-arjun",
    },
    {
        "email": "sara.lin@example.com",
        "name": "Sara Lin",
        "personal_meeting_id": "60294417853",
        "google_id": "seed-google-sara",
    },
    {
        "email": "daniel.okafor@example.com",
        "name": "Daniel Okafor",
        "personal_meeting_id": "77361052984",
        "google_id": "seed-google-daniel",
    },
]

# Fixed meeting numbers so demo links, screenshots, and this file agree. Real
# meetings get random numbers via `services.security` (§3.3); these are seed
# constants, deliberately outside that path so a reseed reproduces the same URLs.
SEED_MEETING_NUMBERS = {
    "upcoming_today": "89590250750",
    "upcoming_tomorrow": "92014477361",
    "ended_standup": "84413920557",
    "ended_review": "70558812394",
    "ended_retro": "63920174485",
    "live_now": "95512038847",
}


def _get_or_create_user(session: Session, spec: dict[str, Any]) -> User:
    """Match on email — the unique natural key that survives a reseed."""
    user = session.exec(select(User).where(User.email == spec["email"])).first()
    if user is not None:
        return user
    user = User(
        email=spec["email"],
        name=spec["name"],
        avatar_url=spec.get("avatar_url"),
        personal_meeting_id=spec["personal_meeting_id"],
        plan=spec.get("plan", "basic"),
        is_guest=spec.get("is_guest", False),
        google_id=spec.get("google_id"),
    )
    session.add(user)
    session.flush()
    return user


def _get_or_create_meeting(
    session: Session, number: str, defaults: dict[str, Any]
) -> tuple[Meeting, bool]:
    """Match on the fixed seed meeting number. Returns `(meeting, created)`.

    The `created` flag is what keeps child rows (participants, chat) idempotent:
    they are only written on the pass that created the parent, so a second run
    does not append a duplicate transcript to an existing meeting.
    """
    meeting = session.exec(
        select(Meeting).where(Meeting.meeting_number == number)
    ).first()
    if meeting is not None:
        return meeting, False
    meeting = Meeting(meeting_number=number, **defaults)
    session.add(meeting)
    session.flush()
    return meeting, True


def _add_participant(
    session: Session,
    meeting: Meeting,
    user: User,
    *,
    role: str = ROLE_PARTICIPANT,
    joined_at: datetime,
    left_at: datetime | None,
    is_muted: bool = False,
    is_video_on: bool = True,
) -> Participant:
    participant = Participant(
        meeting_id=meeting.id,
        user_id=user.id,
        display_name=user.name,
        role=role,
        joined_at=joined_at,
        left_at=left_at,
        is_muted=is_muted,
        is_video_on=is_video_on,
    )
    session.add(participant)
    session.flush()
    return participant


def _add_chat(
    session: Session,
    meeting: Meeting,
    lines: list[tuple[Participant, str]],
    start: datetime,
) -> None:
    """Write a transcript, spacing messages ~40s apart so the drawer looks real."""
    for offset, (participant, body) in enumerate(lines):
        session.add(
            ChatMessage(
                meeting_id=meeting.id,
                participant_id=participant.id,
                body=body,
                sent_at=start + timedelta(seconds=40 * offset),
            )
        )
    session.flush()


def _meeting_defaults(host: User, **overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "host_id": host.id,
        "topic": "My Meeting",
        "description": None,
        "scheduled_start": None,
        "duration_minutes": 40,
        "timezone": "Asia/Kolkata",
        "passcode": generate_passcode(),
        "invite_token": generate_invite_token(),
        "status": STATUS_SCHEDULED,
        "use_pmi": False,
        "waiting_room": True,
        "host_video_on": True,
        "participant_video_on": True,
        "allow_transcription": False,
        "chat_before_after": True,
        "encryption": "enhanced",
        "started_at": None,
        "ended_at": None,
    }
    base.update(overrides)
    return base


def seed(session: Session) -> dict[str, int]:
    """Populate the demo dataset. Returns a per-table count of what now exists."""
    now = utcnow()
    # Anchor the day at local midnight so "today +3h" is always inside today,
    # even when the seed runs late in the evening.
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)

    primary = _get_or_create_user(session, PRIMARY_USER)
    secondaries = [_get_or_create_user(session, spec) for spec in SECONDARY_USERS]
    arjun, sara, daniel = secondaries

    # Preferences for the primary user so the Settings modal opens on real data.
    if session.get(UserPreferences, primary.id) is None:
        session.add(
            UserPreferences(
                user_id=primary.id,
                theme="classic",
                mute_on_join=True,
                video_off_on_join=False,
                gallery_size=9,
            )
        )

    # --- 2 upcoming scheduled meetings (§3.4) -------------------------------
    upcoming_today_start = now + timedelta(hours=3)
    meeting, created = _get_or_create_meeting(
        session,
        SEED_MEETING_NUMBERS["upcoming_today"],
        _meeting_defaults(
            primary,
            topic="Product Sync — Q3 Roadmap",
            description="Walk through the Q3 roadmap and lock scope for the next sprint.",
            scheduled_start=upcoming_today_start,
            duration_minutes=40,
            status=STATUS_SCHEDULED,
        ),
    )
    if created:
        for email in ("arjun.mehta@example.com", "sara.lin@example.com"):
            session.add(MeetingInvitee(meeting_id=meeting.id, email=email))

    _get_or_create_meeting(
        session,
        SEED_MEETING_NUMBERS["upcoming_tomorrow"],
        _meeting_defaults(
            primary,
            topic="Design Review — Meeting Room UI",
            description="Review the room grid, control bar, and drawer interactions.",
            scheduled_start=today + timedelta(days=1, hours=10, minutes=30),
            duration_minutes=40,
            status=STATUS_SCHEDULED,
            waiting_room=False,
        ),
    )

    # --- 3 ended meetings with participants and chat (§3.4) -----------------
    standup_start = now - timedelta(days=1, hours=4)
    standup, created = _get_or_create_meeting(
        session,
        SEED_MEETING_NUMBERS["ended_standup"],
        _meeting_defaults(
            primary,
            topic="Daily Standup",
            description="Fifteen-minute sync across the team.",
            scheduled_start=standup_start,
            duration_minutes=15,
            status=STATUS_ENDED,
            started_at=standup_start,
            ended_at=standup_start + timedelta(minutes=14),
        ),
    )
    if created:
        host_p = _add_participant(
            session,
            standup,
            primary,
            role=ROLE_HOST,
            joined_at=standup_start,
            left_at=standup_start + timedelta(minutes=14),
        )
        arjun_p = _add_participant(
            session,
            standup,
            arjun,
            joined_at=standup_start + timedelta(minutes=1),
            left_at=standup_start + timedelta(minutes=14),
        )
        sara_p = _add_participant(
            session,
            standup,
            sara,
            joined_at=standup_start + timedelta(minutes=1),
            left_at=standup_start + timedelta(minutes=13),
            is_muted=True,
        )
        _add_chat(
            session,
            standup,
            [
                (host_p, "Morning all — keeping this to fifteen."),
                (arjun_p, "Signaling layer is merged, starting on the mesh today."),
                (sara_p, "Design review moved to tomorrow 10:30."),
                (host_p, "Perfect. Anything blocked?"),
                (arjun_p, "Nothing blocked."),
            ],
            standup_start + timedelta(minutes=1),
        )

    review_start = now - timedelta(days=3, hours=2)
    review, created = _get_or_create_meeting(
        session,
        SEED_MEETING_NUMBERS["ended_review"],
        _meeting_defaults(
            primary,
            topic="Sprint Review",
            description="Demo of the shell, home clock, and join flow.",
            scheduled_start=review_start,
            duration_minutes=40,
            status=STATUS_ENDED,
            started_at=review_start,
            ended_at=review_start + timedelta(minutes=38),
        ),
    )
    if created:
        host_p = _add_participant(
            session,
            review,
            primary,
            role=ROLE_HOST,
            joined_at=review_start,
            left_at=review_start + timedelta(minutes=38),
        )
        daniel_p = _add_participant(
            session,
            review,
            daniel,
            joined_at=review_start + timedelta(minutes=2),
            left_at=review_start + timedelta(minutes=38),
        )
        sara_p = _add_participant(
            session,
            review,
            sara,
            joined_at=review_start + timedelta(minutes=3),
            left_at=review_start + timedelta(minutes=36),
        )
        _add_chat(
            session,
            review,
            [
                (host_p, "Sharing the shell build now."),
                (daniel_p, "The rail active pill looks spot on."),
                (sara_p, "Clock font weight could go one step heavier."),
                (host_p, "Noted — will bump it to 600."),
            ],
            review_start + timedelta(minutes=4),
        )

    retro_start = now - timedelta(days=7, hours=1)
    retro, created = _get_or_create_meeting(
        session,
        SEED_MEETING_NUMBERS["ended_retro"],
        _meeting_defaults(
            primary,
            topic="Sprint Retro",
            description="What went well, what to change.",
            scheduled_start=retro_start,
            duration_minutes=30,
            status=STATUS_ENDED,
            started_at=retro_start,
            ended_at=retro_start + timedelta(minutes=29),
        ),
    )
    if created:
        host_p = _add_participant(
            session,
            retro,
            primary,
            role=ROLE_HOST,
            joined_at=retro_start,
            left_at=retro_start + timedelta(minutes=29),
        )
        arjun_p = _add_participant(
            session,
            retro,
            arjun,
            joined_at=retro_start,
            left_at=retro_start + timedelta(minutes=29),
        )
        daniel_p = _add_participant(
            session,
            retro,
            daniel,
            joined_at=retro_start + timedelta(minutes=2),
            left_at=retro_start + timedelta(minutes=27),
            is_video_on=False,
        )
        _add_chat(
            session,
            retro,
            [
                (host_p, "Two things that went well, two to change."),
                (arjun_p, "TURN setup earlier next time — it cost us a day."),
                (daniel_p, "Agreed. Also cap the mesh at six explicitly."),
                (host_p, "Both captured."),
            ],
            retro_start + timedelta(minutes=2),
        )

    # --- 1 live meeting for immediate join testing (§3.4) -------------------
    live_start = now - timedelta(minutes=12)
    live, created = _get_or_create_meeting(
        session,
        SEED_MEETING_NUMBERS["live_now"],
        _meeting_defaults(
            primary,
            topic="Pinak Kundu's Zoom Meeting",
            description="Live room, open for join testing.",
            scheduled_start=None,  # instant meeting (§3.2)
            duration_minutes=40,
            status=STATUS_LIVE,
            started_at=live_start,
            waiting_room=False,
        ),
    )
    if created:
        # left_at IS NULL => currently present (§3.2). The live room must show
        # real occupants or the join-testing path has nothing to mesh with.
        _add_participant(
            session,
            live,
            primary,
            role=ROLE_HOST,
            joined_at=live_start,
            left_at=None,
        )
        _add_participant(
            session,
            live,
            arjun,
            joined_at=live_start + timedelta(minutes=2),
            left_at=None,
            is_muted=True,
        )

    session.commit()
    return counts(session)


def counts(session: Session) -> dict[str, int]:
    """Row counts per table — the assertion surface for idempotency."""
    return {
        "users": len(session.exec(select(User)).all()),
        "meetings": len(session.exec(select(Meeting)).all()),
        "participants": len(session.exec(select(Participant)).all()),
        "chat_messages": len(session.exec(select(ChatMessage)).all()),
        "meeting_invitees": len(session.exec(select(MeetingInvitee)).all()),
        "user_preferences": len(session.exec(select(UserPreferences)).all()),
    }


def reset(session: Session) -> None:
    """Delete every row, children first so FK constraints stay satisfied.

    `foreign_keys=ON` is live (§3.2), so deleting users before participants
    would be rejected — the order below is load-bearing, not cosmetic.
    """
    for model in (
        ChatMessage,
        Participant,
        MeetingInvitee,
        Meeting,
        UserPreferences,
        User,
    ):
        session.exec(delete(model))
    session.commit()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Seed the demo database (§3.4).")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Delete all existing rows before seeding.",
    )
    args = parser.parse_args(argv)

    init_db()
    with session_scope() as session:
        if args.reset:
            reset(session)
        result = seed(session)

    print(f"Seeded {engine.url}")
    for table, count in result.items():
        print(f"  {table:<18} {count}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
