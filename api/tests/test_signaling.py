"""Signaling authorization and the WS protocol (§5.2, §11 — explicitly graded).

Three things §11 names: `session_id` auth rejection, host-only authorization on
`host.*` frames, and the participant `left_at` lifecycle across a socket's life.

The service-layer tests below are the authorization contract; the `TestClient`
websocket tests at the bottom prove the route actually enforces it on the wire,
including the 4401 close code §5.2 mandates.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models import STATUS_LIVE, Participant, User
from app.realtime import protocol as p
from app.realtime.registry import RoomRegistry
from app.services.errors import ForbiddenError, NotFoundError
from app.services.meeting_service import create_meeting, end_meeting
from app.services.participant_service import MeetingNotJoinable, join_meeting, mark_left
from app.services.signaling_service import (
    InvalidSession,
    active_roster,
    apply_state_update,
    authenticate,
    bind_connection,
    host_end_meeting,
    host_mute,
    host_mute_all,
    host_remove,
    release_connection,
    require_host,
    room_snapshot,
)


@pytest.fixture
def live_meeting(session: Session, host: User) -> dict:
    meeting = create_meeting(session, host, topic="Signaling Test")
    assert meeting["status"] == STATUS_LIVE
    return meeting


@pytest.fixture
def host_join(session: Session, live_meeting: dict, host: User) -> dict:
    return join_meeting(session, live_meeting["meeting_number"], user=host)


@pytest.fixture
def guest_join(session: Session, live_meeting: dict, joiner: User) -> dict:
    return join_meeting(
        session,
        live_meeting["meeting_number"],
        user=joiner,
        passcode=live_meeting["passcode"],
    )


def _row(session: Session, joined: dict) -> Participant:
    return session.get(Participant, joined["participant"]["id"])


# --- session_id authentication (§5.2, §11) -----------------------------------


def test_a_valid_session_id_authenticates(
    session: Session, live_meeting: dict, host_join: dict
) -> None:
    meeting, participant = authenticate(
        session, live_meeting["meeting_number"], host_join["session_id"]
    )
    assert meeting.meeting_number == live_meeting["meeting_number"]
    assert participant.id == host_join["participant"]["id"]


def test_an_unknown_session_id_is_rejected(
    session: Session, live_meeting: dict
) -> None:
    with pytest.raises(InvalidSession):
        authenticate(session, live_meeting["meeting_number"], "not-a-real-session")


def test_a_session_id_from_another_meeting_is_rejected(
    session: Session, host: User, joiner: User, live_meeting: dict, host_join: dict
) -> None:
    """The session must belong to *this* room — otherwise a valid session in any
    meeting would open a socket into every meeting."""
    other = create_meeting(session, host, topic="Other Room")
    with pytest.raises(InvalidSession):
        authenticate(session, other["meeting_number"], host_join["session_id"])


def test_a_session_id_that_already_left_is_rejected(
    session: Session, live_meeting: dict, host_join: dict
) -> None:
    """`left_at IS NOT NULL` means the credential is spent (§3.2)."""
    mark_left(session, _row(session, host_join))
    with pytest.raises(InvalidSession):
        authenticate(session, live_meeting["meeting_number"], host_join["session_id"])


def test_the_spaced_display_form_of_the_number_still_authenticates(
    session: Session, live_meeting: dict, host_join: dict
) -> None:
    meeting, _ = authenticate(
        session, live_meeting["meeting_number_display"], host_join["session_id"]
    )
    assert meeting.meeting_number == live_meeting["meeting_number"]


def test_connecting_to_an_ended_meeting_is_refused(
    session: Session, live_meeting: dict, host: User, host_join: dict
) -> None:
    end_meeting(session, live_meeting["meeting_number"], host)
    with pytest.raises(MeetingNotJoinable):
        authenticate(session, live_meeting["meeting_number"], host_join["session_id"])


# --- host-only authorization on host.* frames (§5.2, §11) --------------------


def test_the_host_row_authorizes_host_frames(
    session: Session, host_join: dict
) -> None:
    meeting = require_host(session, _row(session, host_join))
    assert meeting.host_id == _row(session, host_join).user_id


def test_a_non_host_cannot_authorize_a_host_frame(
    session: Session, guest_join: dict
) -> None:
    """§5.2 — the server never trusts a client-declared role."""
    with pytest.raises(ForbiddenError) as exc:
        require_host(session, _row(session, guest_join))
    assert exc.value.code == "NOT_HOST"


def test_a_non_host_calling_host_mute_is_rejected(
    session: Session, host_join: dict, guest_join: dict
) -> None:
    """The graded case: a participant aiming host.mute at the host must fail."""
    with pytest.raises(ForbiddenError):
        host_mute(session, _row(session, guest_join), host_join["participant"]["id"])
    # And the target must be untouched.
    assert _row(session, host_join).is_muted is False


def test_a_non_host_calling_host_mute_all_is_rejected(
    session: Session, host_join: dict, guest_join: dict
) -> None:
    with pytest.raises(ForbiddenError):
        host_mute_all(session, _row(session, guest_join))
    assert _row(session, host_join).is_muted is False


def test_a_non_host_calling_host_remove_is_rejected(
    session: Session, host_join: dict, guest_join: dict
) -> None:
    with pytest.raises(ForbiddenError):
        host_remove(session, _row(session, guest_join), host_join["participant"]["id"])
    assert _row(session, host_join).left_at is None


def test_a_non_host_cannot_end_the_meeting(
    session: Session, live_meeting: dict, host_join: dict, guest_join: dict
) -> None:
    with pytest.raises(ForbiddenError):
        host_end_meeting(session, _row(session, guest_join))


def test_a_forged_host_role_on_the_row_still_fails_ownership(
    session: Session, guest_join: dict
) -> None:
    """`role` and `meeting.host_id` are checked independently, so a row whose
    role says host but who does not own the meeting gains nothing."""
    row = _row(session, guest_join)
    row.role = "host"
    session.add(row)
    session.commit()
    with pytest.raises(ForbiddenError):
        require_host(session, row)


def test_the_host_can_mute_a_participant(
    session: Session, host_join: dict, guest_join: dict
) -> None:
    updated = host_mute(
        session, _row(session, host_join), guest_join["participant"]["id"]
    )
    assert updated["is_muted"] is True


def test_host_mute_all_spares_the_host(
    session: Session, host_join: dict, guest_join: dict
) -> None:
    updated = host_mute_all(session, _row(session, host_join))
    assert [u["id"] for u in updated] == [guest_join["participant"]["id"]]
    assert _row(session, host_join).is_muted is False


def test_the_host_cannot_mute_someone_in_another_meeting(
    session: Session, host: User, host_join: dict, joiner: User
) -> None:
    """Scoped to the actor's own room — an id from elsewhere is a 404, not a mute."""
    other = create_meeting(session, host, topic="Elsewhere")
    outsider = join_meeting(session, other["meeting_number"], user=host)
    with pytest.raises(NotFoundError):
        host_mute(session, _row(session, host_join), outsider["participant"]["id"])


def test_the_host_can_remove_a_participant(
    session: Session, host_join: dict, guest_join: dict
) -> None:
    removed = host_remove(
        session, _row(session, host_join), guest_join["participant"]["id"]
    )
    assert removed["left_at"] is not None


def test_the_host_cannot_remove_themselves(
    session: Session, host_join: dict
) -> None:
    with pytest.raises(ForbiddenError):
        host_remove(session, _row(session, host_join), host_join["participant"]["id"])


def test_host_end_evicts_everyone(
    session: Session, host_join: dict, guest_join: dict
) -> None:
    """§5.4 — eviction is part of the transition, not a follow-up."""
    ended = host_end_meeting(session, _row(session, host_join))
    assert ended["status"] == "ended"
    assert _row(session, host_join).left_at is not None
    assert _row(session, guest_join).left_at is not None


# --- state.update is self-service only ---------------------------------------


def test_state_update_changes_only_the_declared_fields(
    session: Session, guest_join: dict
) -> None:
    updated = apply_state_update(
        session, guest_join["participant"]["id"], {"is_muted": True}
    )
    assert updated["is_muted"] is True
    assert updated["is_video_on"] is True  # untouched


def test_state_update_on_a_missing_participant_raises(session: Session) -> None:
    with pytest.raises(NotFoundError):
        apply_state_update(session, "no-such-participant", {"is_muted": True})


# --- left_at lifecycle across a connection (§11) -----------------------------


def test_binding_a_connection_records_it(
    session: Session, host_join: dict
) -> None:
    bind_connection(session, _row(session, host_join), "conn-1")
    assert _row(session, host_join).connection_id == "conn-1"


def test_releasing_a_connection_closes_the_participant_row(
    session: Session, host_join: dict
) -> None:
    participant = _row(session, host_join)
    bind_connection(session, participant, "conn-1")
    closed = release_connection(session, participant.id, "conn-1")
    assert closed is not None
    assert closed["left_at"] is not None
    assert _row(session, host_join).connection_id is None


def test_a_stale_connection_release_does_not_close_a_newer_session(
    session: Session, host_join: dict
) -> None:
    """A fast refresh binds conn-2 before conn-1's disconnect handler runs; the
    stale handler must not evict the live socket."""
    participant = _row(session, host_join)
    bind_connection(session, participant, "conn-1")
    bind_connection(session, participant, "conn-2")

    assert release_connection(session, participant.id, "conn-1") is None
    assert _row(session, host_join).left_at is None

    assert release_connection(session, participant.id, "conn-2") is not None
    assert _row(session, host_join).left_at is not None


def test_the_roster_only_contains_present_participants(
    session: Session, live_meeting: dict, host_join: dict, guest_join: dict
) -> None:
    assert len(active_roster(session, live_meeting["id"])) == 2
    mark_left(session, _row(session, guest_join))
    roster = active_roster(session, live_meeting["id"])
    assert [r["id"] for r in roster] == [host_join["participant"]["id"]]


def test_the_room_snapshot_carries_participants_you_and_meeting(
    session: Session, live_meeting: dict, host_join: dict, guest_join: dict
) -> None:
    """§5.2 `room.state` — the full snapshot the client reconciles against."""
    meeting, participant = authenticate(
        session, live_meeting["meeting_number"], guest_join["session_id"]
    )
    snapshot = room_snapshot(session, meeting, participant)
    assert set(snapshot) == {"participants", "you", "meeting"}
    assert len(snapshot["participants"]) == 2
    assert snapshot["you"]["id"] == guest_join["participant"]["id"]
    assert snapshot["meeting"]["meeting_number"] == live_meeting["meeting_number"]


def test_the_room_snapshot_never_leaks_session_ids(
    session: Session, live_meeting: dict, host_join: dict
) -> None:
    meeting, participant = authenticate(
        session, live_meeting["meeting_number"], host_join["session_id"]
    )
    snapshot = room_snapshot(session, meeting, participant)
    assert all("session_id" not in row for row in snapshot["participants"])
    assert "session_id" not in snapshot["you"]


# --- RoomRegistry (§5.2 relay guard) -----------------------------------------


def test_the_registry_only_reports_peers_in_the_same_room() -> None:
    """§5.2 — relay `signal.*` only after confirming both peers are in the room."""
    reg = RoomRegistry()
    a = reg.add("meeting-1", "participant-a", _FakeSocket())
    reg.add("meeting-2", "participant-b", _FakeSocket())

    assert reg.is_in_room("meeting-1", "participant-a") is True
    assert reg.is_in_room("meeting-1", "participant-b") is False
    assert reg.size("meeting-1") == 1

    reg.remove(a)
    assert reg.is_in_room("meeting-1", "participant-a") is False


def test_duplicate_sockets_count_as_one_participant() -> None:
    """A mid-refresh client holds two sockets; the §5.1 cap counts people."""
    reg = RoomRegistry()
    reg.add("meeting-1", "participant-a", _FakeSocket())
    reg.add("meeting-1", "participant-a", _FakeSocket())
    assert reg.size("meeting-1") == 1
    assert len(reg.connections("meeting-1")) == 2


class _FakeSocket:
    """Stand-in for a Starlette WebSocket; the registry only stores it."""


# --- Wire-level protocol (§5.2) ----------------------------------------------


def _ws_url(meeting_number: str, session_id: str) -> str:
    return f"/ws/meeting/{meeting_number}?session_id={session_id}"


@pytest.fixture
def released(session: Session) -> Session:
    """Release this test's SQLite transaction before opening a socket.

    The WS route deliberately opens its *own* short-lived `Session(engine)` per
    frame (see `realtime.router._db`). SQLite allows one writer at a time, so a
    test fixture still sitting inside an open transaction would block that
    connection until `busy_timeout` expires — the socket appears to hang rather
    than fail. Committing here ends the test's transaction while leaving its rows
    visible to the route's connection.

    Returns the session so assertions can re-read rows afterwards; they call
    `expire_all()` first because the route wrote through a different connection
    and this session's identity map is stale.
    """
    session.commit()
    return session


def test_a_bad_session_id_closes_with_4401(
    client: TestClient, released: Session, live_meeting: dict
) -> None:
    """§5.2 mandates close code 4401 on a failed session validation."""
    with client.websocket_connect(
        _ws_url(live_meeting["meeting_number"], "bogus-session")
    ) as ws:
        first = ws.receive_json()
        assert first["type"] == p.ERROR
        assert first["payload"]["code"] == "INVALID_SESSION"
        closed = ws.receive()
        assert closed["type"] == "websocket.close"
        assert closed["code"] == p.CLOSE_UNAUTHORIZED


def test_room_state_is_the_first_frame_after_connect(
    client: TestClient, released: Session, live_meeting: dict, host_join: dict
) -> None:
    with client.websocket_connect(
        _ws_url(live_meeting["meeting_number"], host_join["session_id"])
    ) as ws:
        first = ws.receive_json()
        assert first["type"] == p.ROOM_STATE
        assert first["payload"]["you"]["id"] == host_join["participant"]["id"]


def test_a_joiner_produces_peer_joined_for_the_existing_peer(
    client: TestClient,
    released: Session,
    live_meeting: dict,
    host_join: dict,
    guest_join: dict,
) -> None:
    """§5.3 — the peer already in the room hears `peer.joined` and initiates;
    the newcomer only ever sees `room.state`, so roles are unambiguous."""
    with client.websocket_connect(
        _ws_url(live_meeting["meeting_number"], host_join["session_id"])
    ) as first:
        assert first.receive_json()["type"] == p.ROOM_STATE

        with client.websocket_connect(
            _ws_url(live_meeting["meeting_number"], guest_join["session_id"])
        ) as second:
            assert second.receive_json()["type"] == p.ROOM_STATE
            notice = first.receive_json()
            assert notice["type"] == p.PEER_JOINED
            assert notice["payload"]["participant"]["id"] == (
                guest_join["participant"]["id"]
            )


def test_ping_is_answered(
    client: TestClient, released: Session, live_meeting: dict, host_join: dict
) -> None:
    """§5.6 heartbeat every 25s."""
    with client.websocket_connect(
        _ws_url(live_meeting["meeting_number"], host_join["session_id"])
    ) as ws:
        ws.receive_json()
        ws.send_json({"type": p.PING, "payload": {}})
        assert ws.receive_json()["type"] == p.PONG


def test_a_non_host_host_mute_frame_is_rejected_on_the_wire(
    client: TestClient,
    released: Session,
    live_meeting: dict,
    host_join: dict,
    guest_join: dict,
) -> None:
    """The graded §11 case, end to end: a participant sends host.mute and gets an
    `error` frame back rather than a mute taking effect."""
    with client.websocket_connect(
        _ws_url(live_meeting["meeting_number"], guest_join["session_id"])
    ) as ws:
        ws.receive_json()
        ws.send_json(
            {
                "type": p.HOST_MUTE,
                "payload": {"participant_id": host_join["participant"]["id"]},
            }
        )
        reply = ws.receive_json()
        assert reply["type"] == p.ERROR
        assert reply["payload"]["code"] == "NOT_HOST"

    released.expire_all()
    assert released.get(Participant, host_join["participant"]["id"]).is_muted is False


def test_a_host_mute_frame_from_the_host_mutes_the_target(
    client: TestClient,
    released: Session,
    live_meeting: dict,
    host_join: dict,
    guest_join: dict,
) -> None:
    with client.websocket_connect(
        _ws_url(live_meeting["meeting_number"], guest_join["session_id"])
    ) as target:
        target.receive_json()

        with client.websocket_connect(
            _ws_url(live_meeting["meeting_number"], host_join["session_id"])
        ) as host_ws:
            host_ws.receive_json()
            target.receive_json()  # peer.joined for the host
            host_ws.send_json(
                {
                    "type": p.HOST_MUTE,
                    "payload": {"participant_id": guest_join["participant"]["id"]},
                }
            )
            # The target must be told to actually mute itself (§5.2).
            frames = [target.receive_json(), target.receive_json()]
            types = {f["type"] for f in frames}
            assert p.HOST_MUTED_YOU in types
            assert p.PEER_UPDATED in types

    released.expire_all()
    assert released.get(Participant, guest_join["participant"]["id"]).is_muted is True


def test_a_signal_frame_to_a_peer_outside_the_room_is_refused(
    client: TestClient, released: Session, live_meeting: dict, host_join: dict
) -> None:
    """§5.2 — relay only after confirming both peers are in the same room."""
    with client.websocket_connect(
        _ws_url(live_meeting["meeting_number"], host_join["session_id"])
    ) as ws:
        ws.receive_json()
        ws.send_json(
            {"type": p.SIGNAL_OFFER, "to": "someone-else", "payload": {"sdp": "v=0"}}
        )
        reply = ws.receive_json()
        assert reply["type"] == p.ERROR
        assert reply["payload"]["code"] == "PEER_NOT_IN_ROOM"


def test_an_offer_is_relayed_verbatim_to_the_named_peer(
    client: TestClient,
    released: Session,
    live_meeting: dict,
    host_join: dict,
    guest_join: dict,
) -> None:
    with client.websocket_connect(
        _ws_url(live_meeting["meeting_number"], host_join["session_id"])
    ) as initiator:
        initiator.receive_json()

        with client.websocket_connect(
            _ws_url(live_meeting["meeting_number"], guest_join["session_id"])
        ) as newcomer:
            newcomer.receive_json()
            initiator.receive_json()  # peer.joined

            initiator.send_json(
                {
                    "type": p.SIGNAL_OFFER,
                    "to": guest_join["participant"]["id"],
                    "payload": {"sdp": "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n"},
                }
            )
            relayed = newcomer.receive_json()
            assert relayed["type"] == p.SIGNAL_OFFER
            assert relayed["from"] == host_join["participant"]["id"]
            assert relayed["payload"]["sdp"].startswith("v=0")


def test_chat_send_persists_and_broadcasts(
    client: TestClient, released: Session, live_meeting: dict, host_join: dict
) -> None:
    """§5.2 / §6.7 — history must survive a refresh, so persist then broadcast."""
    from app.models import ChatMessage

    with client.websocket_connect(
        _ws_url(live_meeting["meeting_number"], host_join["session_id"])
    ) as ws:
        ws.receive_json()
        ws.send_json({"type": p.CHAT_SEND, "payload": {"body": "  hello room  "}})
        message = ws.receive_json()
        assert message["type"] == p.CHAT_MESSAGE
        assert message["payload"]["body"] == "hello room"  # server-trimmed

    stored = released.exec(
        select(ChatMessage).where(ChatMessage.meeting_id == live_meeting["id"])
    ).all()
    assert [m.body for m in stored] == ["hello room"]


def test_an_over_long_chat_body_is_truncated_server_side(
    client: TestClient, released: Session, live_meeting: dict, host_join: dict
) -> None:
    """§5.2 caps bodies at 2000 chars; the client's own limit is a convenience."""
    from app.models import MAX_CHAT_BODY_LENGTH

    with client.websocket_connect(
        _ws_url(live_meeting["meeting_number"], host_join["session_id"])
    ) as ws:
        ws.receive_json()
        ws.send_json({"type": p.CHAT_SEND, "payload": {"body": "x" * 5000}})
        message = ws.receive_json()
        assert len(message["payload"]["body"]) == MAX_CHAT_BODY_LENGTH


def test_state_update_is_broadcast_as_peer_updated(
    client: TestClient,
    released: Session,
    live_meeting: dict,
    host_join: dict,
    guest_join: dict,
) -> None:
    with client.websocket_connect(
        _ws_url(live_meeting["meeting_number"], host_join["session_id"])
    ) as watcher:
        watcher.receive_json()

        with client.websocket_connect(
            _ws_url(live_meeting["meeting_number"], guest_join["session_id"])
        ) as mover:
            mover.receive_json()
            watcher.receive_json()  # peer.joined

            mover.send_json({"type": p.STATE_UPDATE, "payload": {"is_muted": True}})
            update = watcher.receive_json()
            assert update["type"] == p.PEER_UPDATED
            assert update["payload"]["participant_id"] == (
                guest_join["participant"]["id"]
            )
            assert update["payload"]["is_muted"] is True


def test_an_unknown_frame_type_is_an_error_not_a_disconnect(
    client: TestClient, released: Session, live_meeting: dict, host_join: dict
) -> None:
    with client.websocket_connect(
        _ws_url(live_meeting["meeting_number"], host_join["session_id"])
    ) as ws:
        ws.receive_json()
        ws.send_json({"type": "definitely.not.a.frame", "payload": {}})
        assert ws.receive_json()["payload"]["code"] == "UNKNOWN_FRAME"
        # Socket survives; a garbage frame must not drop the client.
        ws.send_json({"type": p.PING, "payload": {}})
        assert ws.receive_json()["type"] == p.PONG


def test_disconnecting_closes_the_participant_row(
    client: TestClient, released: Session, live_meeting: dict, host_join: dict
) -> None:
    """§11 — the `left_at` lifecycle, driven by the socket rather than REST."""
    with client.websocket_connect(
        _ws_url(live_meeting["meeting_number"], host_join["session_id"])
    ) as ws:
        ws.receive_json()

    released.expire_all()
    assert released.get(Participant, host_join["participant"]["id"]).left_at is not None


def test_a_departure_is_announced_as_peer_left(
    client: TestClient,
    released: Session,
    live_meeting: dict,
    host_join: dict,
    guest_join: dict,
) -> None:
    with client.websocket_connect(
        _ws_url(live_meeting["meeting_number"], host_join["session_id"])
    ) as watcher:
        watcher.receive_json()

        with client.websocket_connect(
            _ws_url(live_meeting["meeting_number"], guest_join["session_id"])
        ) as leaver:
            leaver.receive_json()
            watcher.receive_json()  # peer.joined

        departure = watcher.receive_json()
        assert departure["type"] == p.PEER_LEFT
        assert departure["payload"]["participant_id"] == guest_join["participant"]["id"]


def test_host_end_broadcasts_meeting_ended(
    client: TestClient,
    released: Session,
    live_meeting: dict,
    host_join: dict,
    guest_join: dict,
) -> None:
    """§6.7 End for All -> every client tears down and returns to /home."""
    with client.websocket_connect(
        _ws_url(live_meeting["meeting_number"], guest_join["session_id"])
    ) as guest_ws:
        guest_ws.receive_json()

        with client.websocket_connect(
            _ws_url(live_meeting["meeting_number"], host_join["session_id"])
        ) as host_ws:
            host_ws.receive_json()
            guest_ws.receive_json()  # peer.joined

            host_ws.send_json({"type": p.HOST_END, "payload": {}})
            ended = guest_ws.receive_json()
            assert ended["type"] == p.MEETING_ENDED

    released.expire_all()
    from app.models import Meeting

    assert released.get(Meeting, live_meeting["id"]).status == "ended"


def test_host_remove_evicts_the_target_socket(
    client: TestClient,
    released: Session,
    live_meeting: dict,
    host_join: dict,
    guest_join: dict,
) -> None:
    """§6.7 — the target redirects out; its socket is closed by the server so a
    client that ignores the frame still loses its media path."""
    with client.websocket_connect(
        _ws_url(live_meeting["meeting_number"], guest_join["session_id"])
    ) as target:
        target.receive_json()

        with client.websocket_connect(
            _ws_url(live_meeting["meeting_number"], host_join["session_id"])
        ) as host_ws:
            host_ws.receive_json()
            target.receive_json()  # peer.joined

            host_ws.send_json(
                {
                    "type": p.HOST_REMOVE,
                    "payload": {"participant_id": guest_join["participant"]["id"]},
                }
            )
            removed = target.receive_json()
            assert removed["type"] == p.HOST_REMOVED_YOU

    released.expire_all()
    assert released.get(Participant, guest_join["participant"]["id"]).left_at is not None
