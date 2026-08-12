"""Join validation and participant lifecycle (§11 — explicitly graded)."""

from __future__ import annotations

import pytest
from sqlmodel import Session, select

from app.models import STATUS_LIVE, Meeting, Participant, User, UserPreferences
from app.services.errors import ConflictError, ForbiddenError
from app.services.meeting_service import cancel_meeting, create_meeting, end_meeting
from app.services.participant_service import (
    MAX_MESH_PARTICIPANTS,
    InvalidPasscode,
    MeetingFull,
    MeetingNotJoinable,
    join_meeting,
    leave_meeting,
    list_active,
    mark_left,
    remove_participant,
    update_participant,
)


@pytest.fixture
def live_meeting(session: Session, host: User) -> dict:
    """An instant meeting is born live (§5.4), so it is joinable immediately."""
    meeting = create_meeting(session, host, topic="Join Test")
    assert meeting["status"] == STATUS_LIVE
    return meeting


# --- Passcode validation (§11) -----------------------------------------------


def test_join_with_the_correct_passcode_succeeds(
    session: Session, live_meeting: dict, joiner: User
) -> None:
    result = join_meeting(
        session,
        live_meeting["meeting_number"],
        user=joiner,
        passcode=live_meeting["passcode"],
    )
    assert result["participant"]["display_name"] == joiner.name
    assert result["participant"]["role"] == "participant"


def test_join_with_a_wrong_passcode_is_rejected(
    session: Session, live_meeting: dict, joiner: User
) -> None:
    with pytest.raises(InvalidPasscode) as exc:
        join_meeting(
            session, live_meeting["meeting_number"], user=joiner, passcode="wrong!"
        )
    assert exc.value.status_code == 403
    assert exc.value.code == "INVALID_PASSCODE"


def test_join_without_a_passcode_is_rejected(
    session: Session, live_meeting: dict, joiner: User
) -> None:
    with pytest.raises(InvalidPasscode):
        join_meeting(session, live_meeting["meeting_number"], user=joiner)


def test_a_rejected_join_creates_no_participant_row(
    session: Session, live_meeting: dict, joiner: User
) -> None:
    """A failed passcode must not leave a row behind — it would inflate the
    roster and count toward the mesh cap."""
    with pytest.raises(InvalidPasscode):
        join_meeting(session, live_meeting["meeting_number"], user=joiner, passcode="x")
    rows = session.exec(
        select(Participant).where(Participant.meeting_id == live_meeting["id"])
    ).all()
    assert rows == []


def test_a_valid_invite_token_stands_in_for_the_passcode(
    session: Session, live_meeting: dict, joiner: User
) -> None:
    """That is the whole point of the `?pwd=` link (§3.2)."""
    result = join_meeting(
        session,
        live_meeting["meeting_number"],
        user=joiner,
        invite_token=live_meeting["invite_token"],
    )
    assert result["session_id"]


def test_a_wrong_invite_token_does_not_bypass_the_passcode(
    session: Session, live_meeting: dict, joiner: User
) -> None:
    with pytest.raises(InvalidPasscode):
        join_meeting(
            session,
            live_meeting["meeting_number"],
            user=joiner,
            invite_token="not-the-token",
        )


def test_the_host_does_not_need_the_passcode(
    session: Session, live_meeting: dict, host: User
) -> None:
    result = join_meeting(session, live_meeting["meeting_number"], user=host)
    assert result["participant"]["role"] == "host"


def test_join_returns_a_server_minted_session_id(
    session: Session, live_meeting: dict, host: User, joiner: User
) -> None:
    """`session_id` authorizes later WS frames (§5.2) — it must be unique per
    join and never echoed back from the client."""
    a = join_meeting(session, live_meeting["meeting_number"], user=host)
    b = join_meeting(
        session,
        live_meeting["meeting_number"],
        user=joiner,
        passcode=live_meeting["passcode"],
    )
    assert a["session_id"] != b["session_id"]
    assert len(a["session_id"]) == 36  # UUID4


def test_join_returns_ice_servers(
    session: Session, live_meeting: dict, host: User
) -> None:
    """§5.5 — STUN hardcoded, TURN from env (absent here)."""
    ice = join_meeting(session, live_meeting["meeting_number"], user=host)["ice_servers"]
    assert [s["urls"] for s in ice] == [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
    ]
    assert all("credential" not in s for s in ice)


def test_the_roster_never_exposes_session_ids(
    session: Session, live_meeting: dict, host: User, joiner: User
) -> None:
    """A session_id is a bearer credential; other participants must not read it."""
    join_meeting(session, live_meeting["meeting_number"], user=host)
    join_meeting(
        session,
        live_meeting["meeting_number"],
        user=joiner,
        passcode=live_meeting["passcode"],
    )
    for row in list_active(session, live_meeting["meeting_number"], host):
        assert "session_id" not in row


def test_join_is_refused_once_the_meeting_ends(
    session: Session, live_meeting: dict, host: User, joiner: User
) -> None:
    end_meeting(session, live_meeting["meeting_number"], host)
    with pytest.raises(MeetingNotJoinable):
        join_meeting(
            session,
            live_meeting["meeting_number"],
            user=joiner,
            passcode=live_meeting["passcode"],
        )


def test_join_is_refused_for_a_cancelled_meeting(
    session: Session, host: User, joiner: User
) -> None:
    from datetime import timedelta

    from app.models import utcnow

    meeting = create_meeting(
        session, host, topic="Cancelled", scheduled_start=utcnow() + timedelta(days=1)
    )
    cancel_meeting(session, meeting["meeting_number"], host)
    with pytest.raises(MeetingNotJoinable):
        join_meeting(
            session,
            meeting["meeting_number"],
            user=joiner,
            passcode=meeting["passcode"],
        )


def test_the_mesh_cap_is_enforced(
    session: Session, live_meeting: dict, host: User
) -> None:
    """§5.1 — refuse past 6 rather than silently degrading."""
    from tests.conftest import make_user

    for i in range(MAX_MESH_PARTICIPANTS):
        join_meeting(
            session,
            live_meeting["meeting_number"],
            user=make_user(session, name=f"P{i}"),
            passcode=live_meeting["passcode"],
        )
    with pytest.raises(MeetingFull) as exc:
        join_meeting(
            session,
            live_meeting["meeting_number"],
            user=make_user(session, name="Overflow"),
            passcode=live_meeting["passcode"],
        )
    assert exc.value.details["limit"] == MAX_MESH_PARTICIPANTS


def test_join_applies_saved_media_preferences(
    session: Session, live_meeting: dict, joiner: User
) -> None:
    """§6.8 — mute-on-join and video-off must flow through the join path."""
    session.add(
        UserPreferences(user_id=joiner.id, mute_on_join=True, video_off_on_join=True)
    )
    session.commit()
    result = join_meeting(
        session,
        live_meeting["meeting_number"],
        user=joiner,
        passcode=live_meeting["passcode"],
    )
    assert result["participant"]["is_muted"] is True
    assert result["participant"]["is_video_on"] is False


# --- left_at lifecycle (§11) -------------------------------------------------


def test_a_fresh_join_has_a_null_left_at(
    session: Session, live_meeting: dict, host: User
) -> None:
    """`left_at IS NULL` means currently present (§3.2)."""
    result = join_meeting(session, live_meeting["meeting_number"], user=host)
    assert result["participant"]["left_at"] is None


def test_leaving_sets_left_at(
    session: Session, live_meeting: dict, host: User
) -> None:
    joined = join_meeting(session, live_meeting["meeting_number"], user=host)
    left = leave_meeting(session, joined["session_id"])
    assert left["left_at"] is not None


def test_leaving_removes_the_row_from_the_active_roster(
    session: Session, live_meeting: dict, host: User, joiner: User
) -> None:
    host_session = join_meeting(session, live_meeting["meeting_number"], user=host)
    join_meeting(
        session,
        live_meeting["meeting_number"],
        user=joiner,
        passcode=live_meeting["passcode"],
    )
    assert len(list_active(session, live_meeting["meeting_number"], host)) == 2

    leave_meeting(session, host_session["session_id"])
    active = list_active(session, live_meeting["meeting_number"], host)
    assert len(active) == 1
    assert active[0]["display_name"] == joiner.name


def test_leaving_twice_keeps_the_original_timestamp(
    session: Session, live_meeting: dict, host: User
) -> None:
    """Idempotent — a second close must not stretch the recorded session length."""
    joined = join_meeting(session, live_meeting["meeting_number"], user=host)
    first = leave_meeting(session, joined["session_id"])["left_at"]
    second = leave_meeting(session, joined["session_id"])["left_at"]
    assert first == second


def test_rejoining_creates_a_new_row(
    session: Session, live_meeting: dict, host: User
) -> None:
    """One row per join attempt, so history stays auditable (§3.2)."""
    first = join_meeting(session, live_meeting["meeting_number"], user=host)
    leave_meeting(session, first["session_id"])
    second = join_meeting(session, live_meeting["meeting_number"], user=host)

    assert second["participant"]["id"] != first["participant"]["id"]
    rows = session.exec(
        select(Participant).where(Participant.meeting_id == live_meeting["id"])
    ).all()
    assert len(rows) == 2
    assert sum(1 for r in rows if r.left_at is None) == 1


def test_leaving_clears_the_connection_id(
    session: Session, live_meeting: dict, host: User
) -> None:
    """`connection_id` maps to the live socket and is nulled on disconnect (§3.2)."""
    joined = join_meeting(session, live_meeting["meeting_number"], user=host)
    participant = session.get(Participant, joined["participant"]["id"])
    participant.connection_id = "ws-conn-123"
    session.add(participant)
    session.commit()

    mark_left(session, participant)
    session.refresh(participant)
    assert participant.connection_id is None


def test_a_left_participant_frees_a_mesh_slot(
    session: Session, live_meeting: dict, host: User
) -> None:
    """The cap counts active rows, not historical ones."""
    from tests.conftest import make_user

    sessions = [
        join_meeting(
            session,
            live_meeting["meeting_number"],
            user=make_user(session, name=f"P{i}"),
            passcode=live_meeting["passcode"],
        )
        for i in range(MAX_MESH_PARTICIPANTS)
    ]
    leave_meeting(session, sessions[0]["session_id"])
    join_meeting(
        session,
        live_meeting["meeting_number"],
        user=make_user(session, name="Latecomer"),
        passcode=live_meeting["passcode"],
    )


# --- Host controls (§6.7) ----------------------------------------------------


def test_the_host_can_mute_a_participant(
    session: Session, live_meeting: dict, host: User, joiner: User
) -> None:
    join_meeting(session, live_meeting["meeting_number"], user=host)
    other = join_meeting(
        session,
        live_meeting["meeting_number"],
        user=joiner,
        passcode=live_meeting["passcode"],
    )
    result = update_participant(
        session, other["participant"]["id"], host, {"is_muted": True}
    )
    assert result["is_muted"] is True


def test_a_participant_can_mute_themselves(
    session: Session, live_meeting: dict, host: User, joiner: User
) -> None:
    other = join_meeting(
        session,
        live_meeting["meeting_number"],
        user=joiner,
        passcode=live_meeting["passcode"],
    )
    result = update_participant(
        session, other["participant"]["id"], joiner, {"is_muted": True}
    )
    assert result["is_muted"] is True


def test_a_participant_cannot_mute_someone_else(
    session: Session, live_meeting: dict, host: User, joiner: User
) -> None:
    """§5.2 — the server never trusts a client-declared role."""
    from tests.conftest import make_user

    third = make_user(session, name="Third")
    victim = join_meeting(
        session,
        live_meeting["meeting_number"],
        user=third,
        passcode=live_meeting["passcode"],
    )
    with pytest.raises(ForbiddenError):
        update_participant(
            session, victim["participant"]["id"], joiner, {"is_muted": True}
        )


def test_the_host_can_remove_a_participant(
    session: Session, live_meeting: dict, host: User, joiner: User
) -> None:
    other = join_meeting(
        session,
        live_meeting["meeting_number"],
        user=joiner,
        passcode=live_meeting["passcode"],
    )
    removed = remove_participant(session, other["participant"]["id"], host)
    assert removed["left_at"] is not None
    # A removal is `left_at`, not a delete — the row is the audit record.
    assert session.get(Participant, other["participant"]["id"]) is not None


def test_a_non_host_cannot_remove_anyone(
    session: Session, live_meeting: dict, host: User, joiner: User
) -> None:
    host_row = join_meeting(session, live_meeting["meeting_number"], user=host)
    with pytest.raises(ForbiddenError):
        remove_participant(session, host_row["participant"]["id"], joiner)


def test_the_host_cannot_remove_themselves(
    session: Session, live_meeting: dict, host: User
) -> None:
    host_row = join_meeting(session, live_meeting["meeting_number"], user=host)
    with pytest.raises(ConflictError):
        remove_participant(session, host_row["participant"]["id"], host)


def test_a_non_participant_cannot_read_the_roster(
    session: Session, live_meeting: dict, joiner: User
) -> None:
    with pytest.raises(ForbiddenError):
        list_active(session, live_meeting["meeting_number"], joiner)


def test_the_host_joining_a_scheduled_meeting_starts_it(
    session: Session, host: User
) -> None:
    """§5.4: `POST /start (or host joins)`."""
    from datetime import timedelta

    from app.models import STATUS_SCHEDULED, utcnow

    meeting = create_meeting(
        session, host, topic="Scheduled", scheduled_start=utcnow() + timedelta(hours=2)
    )
    assert meeting["status"] == STATUS_SCHEDULED
    result = join_meeting(session, meeting["meeting_number"], user=host)
    assert result["meeting"]["status"] == STATUS_LIVE


def test_foreign_keys_reject_an_orphan_participant(session: Session) -> None:
    """§3.2 pragma `foreign_keys=ON` must actually fire on the real tables."""
    import sqlalchemy.exc

    session.add(
        Participant(
            meeting_id="no-such-meeting",
            user_id=None,
            display_name="Ghost",
        )
    )
    with pytest.raises(sqlalchemy.exc.IntegrityError):
        session.commit()
    session.rollback()


def test_foreign_keys_reject_an_orphan_chat_message(
    session: Session, host: User
) -> None:
    import sqlalchemy.exc

    from app.models import ChatMessage

    session.add(
        ChatMessage(
            meeting_id="no-such-meeting",
            participant_id="no-such-participant",
            body="hello",
        )
    )
    with pytest.raises(sqlalchemy.exc.IntegrityError):
        session.commit()
    session.rollback()


def test_foreign_keys_reject_a_meeting_with_no_host(session: Session) -> None:
    import sqlalchemy.exc

    session.add(
        Meeting(
            meeting_number="12345678901",
            host_id="no-such-user",
            topic="Orphan",
            passcode="Ab3xy9",
            invite_token="orphan-token",
        )
    )
    with pytest.raises(sqlalchemy.exc.IntegrityError):
        session.commit()
    session.rollback()
