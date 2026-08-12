"""The signaling WebSocket route: `/ws/meeting/{meeting_number}` (§5.2).

Protocol only. Every authorization question — is this session real, is this
client the host, are both peers in this room — is answered by
`services.signaling_service` against the database, per §1.3 and the §5.2 rule
that the server never trusts a client-declared role.

Frame handling is a dispatch table rather than an if-chain so the set of
implemented inbound types is readable at a glance against §5.2's table.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlmodel import Session

from app.database import engine
from app.models import MAX_CHAT_BODY_LENGTH
from app.realtime import protocol as p
from app.realtime.registry import Connection, registry
from app.services import chat_service, signaling_service
from app.services.errors import AppError
from app.services.participant_service import MeetingFull

logger = logging.getLogger("app.realtime")

router = APIRouter()


def _db() -> Session:
    """A short-lived session per frame.

    Deliberately not one long-lived session for the socket's lifetime: a
    connection can idle for an hour, and SQLite holding a stale transaction that
    long would both serve stale reads and sit on write locks (§3.2's pragmas
    assume short transactions).
    """
    return Session(engine)


@router.websocket("/ws/meeting/{meeting_number}")
async def meeting_socket(
    websocket: WebSocket,
    meeting_number: str,
    session_id: str = Query(..., description="Server-minted participant session id"),
) -> None:
    """§5.2 — validate `session_id` *before* accepting; close 4401 on failure."""
    with _db() as db:
        try:
            meeting, participant = signaling_service.authenticate(
                db, meeting_number, session_id
            )
        except AppError:
            # Accept-then-close, rather than a bare close: a browser that never
            # sees the handshake complete reports a generic "connection failed"
            # and cannot read the code, so the client could not distinguish a bad
            # session from the API being down.
            await websocket.accept()
            await websocket.send_text(
                p.encode_frame(
                    p.error_frame("INVALID_SESSION", "That session is not valid.")
                )
            )
            await websocket.close(code=p.CLOSE_UNAUTHORIZED)
            return

        meeting_id = meeting.id
        participant_id = participant.id

    await websocket.accept()
    connection = registry.add(meeting_id, participant_id, websocket)

    with _db() as db:
        try:
            signaling_service.assert_room_has_space(db, meeting_id)
        except MeetingFull as exc:
            registry.remove(connection)
            await websocket.send_text(
                p.encode_frame(p.error_frame(exc.code, exc.message))
            )
            await websocket.close(code=p.CLOSE_MEETING_FULL)
            return
        signaling_service.bind_connection(db, participant, connection.connection_id)
        snapshot = signaling_service.room_snapshot(db, meeting, participant)

    # `room.state` is the first frame after connect (§5.2) and is what the
    # newcomer uses to learn who is already here. Crucially it is *not*
    # `peer.joined`, which is what makes the §5.3 initiator rule unambiguous.
    await connection.send(p.frame(p.ROOM_STATE, snapshot, to=participant_id))

    # Existing peers hear `peer.joined` and open the offers (§5.3). The newcomer
    # is excluded so it never sees itself join and never initiates.
    await registry.broadcast(
        meeting_id,
        p.frame(p.PEER_JOINED, {"participant": snapshot["you"]}, sender=participant_id),
        exclude=connection.connection_id,
    )

    try:
        await _message_loop(connection, websocket)
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("signaling loop failed for %s", connection.connection_id)
    finally:
        # Shielded because teardown must survive the cancellation that *causes*
        # it. A disconnect cancels the task running this handler, and both steps
        # below await: closing the participant row touches the database, and
        # `peer.left` is a fan-out to other sockets. Unshielded, the first await
        # raises `CancelledError` and the room never hears the departure — peers
        # keep a dead tile and a stale RTCPeerConnection forever, and the row
        # keeps `left_at IS NULL`, which §3.2 makes the definition of "present".
        await asyncio.shield(asyncio.ensure_future(_teardown(connection)))


async def _message_loop(connection: Connection, websocket: WebSocket) -> None:
    """Read frames until the socket closes."""
    while True:
        message = await websocket.receive_json()
        if not isinstance(message, dict):
            await connection.send(
                p.error_frame("BAD_FRAME", "A frame must be a JSON object.")
            )
            continue

        type_ = message.get("type")
        payload = message.get("payload")
        if not isinstance(payload, dict):
            payload = {}

        handler = _HANDLERS.get(type_) if isinstance(type_, str) else None
        if handler is None:
            await connection.send(
                p.error_frame("UNKNOWN_FRAME", f"Unsupported frame type: {type_!r}")
            )
            continue

        try:
            await handler(connection, message, payload)
        except AppError as exc:
            # Expected, client-facing failures (not host, no such participant,
            # empty body) become an `error` frame; the socket stays open so a
            # rejected host.* attempt does not disconnect the client.
            await connection.send(p.error_frame(exc.code, exc.message, **exc.details))
        except Exception:
            logger.exception("handler for %s failed", type_)
            await connection.send(
                p.error_frame("INTERNAL_ERROR", "That action could not be completed.")
            )


async def _teardown(connection: Connection) -> None:
    """Close the participant row and tell the room, exactly once (§3.2)."""
    registry.remove(connection)
    with _db() as db:
        closed = signaling_service.release_connection(
            db, connection.participant_id, connection.connection_id
        )
    if closed is None:
        # A newer socket owns this participant (fast refresh), or the row was
        # already closed by host.remove / meeting end. Either way this is not a
        # departure and must not emit `peer.left`.
        return
    await registry.broadcast(
        connection.meeting_id,
        p.frame(
            p.PEER_LEFT,
            {"participant_id": connection.participant_id},
            sender=connection.participant_id,
        ),
    )


# --- Handlers (§5.2 client -> server table) ----------------------------------


async def _handle_ping(
    connection: Connection, message: dict[str, Any], payload: dict[str, Any]
) -> None:
    """Heartbeat (§5.6 sends one every 25s). Answered so the client can measure
    liveness rather than only relying on TCP, which can stay open for minutes
    after a network path dies."""
    await connection.send(p.frame(p.PONG, {}, to=connection.participant_id))


async def _handle_signal(
    connection: Connection, message: dict[str, Any], payload: dict[str, Any]
) -> None:
    """Relay `signal.offer` / `signal.answer` / `signal.ice` verbatim (§5.2).

    Two guards, both required: the target must be named, and the target must be
    in *this* room. Without the second, a client could use the socket to push
    arbitrary SDP at a participant of any other meeting whose id it guessed.
    The SDP itself is never inspected — signaling is a relay, not a parser.
    """
    target = message.get("to") or payload.get("to")
    if not isinstance(target, str) or not target:
        raise _bad_request("A signal frame must name a `to` participant.")
    if not registry.is_in_room(connection.meeting_id, target):
        raise _bad_request("That peer is not in this meeting.", code="PEER_NOT_IN_ROOM")

    relay = dict(payload)
    relay.pop("to", None)
    await registry.send_to_participant(
        connection.meeting_id,
        target,
        p.frame(
            str(message["type"]), relay, sender=connection.participant_id, to=target
        ),
    )


async def _handle_state_update(
    connection: Connection, message: dict[str, Any], payload: dict[str, Any]
) -> None:
    """A client reporting its own mute / video / hand state (§5.2)."""
    with _db() as db:
        updated = signaling_service.apply_state_update(
            db, connection.participant_id, payload
        )
    await registry.broadcast(
        connection.meeting_id,
        p.frame(
            p.PEER_UPDATED,
            {
                "participant_id": updated["id"],
                "is_muted": updated["is_muted"],
                "is_video_on": updated["is_video_on"],
                "is_hand_raised": updated["is_hand_raised"],
            },
            sender=connection.participant_id,
        ),
    )


async def _handle_chat_send(
    connection: Connection, message: dict[str, Any], payload: dict[str, Any]
) -> None:
    """Persist then broadcast (§5.2, §6.7).

    Persist-first is what makes history survive a refresh: broadcasting before
    the write would let a crash between the two leave clients showing a message
    the database never recorded.
    """
    body = payload.get("body")
    if not isinstance(body, str):
        raise _bad_request("`body` must be a string.")
    body = body[:MAX_CHAT_BODY_LENGTH]

    with _db() as db:
        saved = chat_service.post_message(
            db, connection.meeting_id, connection.participant_id, body
        )
    await registry.broadcast(
        connection.meeting_id,
        p.frame(p.CHAT_MESSAGE, saved, sender=connection.participant_id),
    )


async def _handle_host_mute(
    connection: Connection, message: dict[str, Any], payload: dict[str, Any]
) -> None:
    """Host mutes one participant. Authorized against the DB row (§5.2)."""
    target_id = payload.get("participant_id")
    if not isinstance(target_id, str) or not target_id:
        raise _bad_request("`participant_id` is required.")

    with _db() as db:
        actor = _actor(db, connection)
        updated = signaling_service.host_mute(db, actor, target_id)

    # The target must actually stop transmitting, which only its own client can
    # do — the DB flag alone is cosmetic (§5.2).
    await registry.send_to_participant(
        connection.meeting_id,
        target_id,
        p.frame(
            p.HOST_MUTED_YOU,
            {"by": connection.participant_id},
            sender=connection.participant_id,
            to=target_id,
        ),
    )
    await _broadcast_peer_updated(connection, updated)


async def _handle_host_mute_all(
    connection: Connection, message: dict[str, Any], payload: dict[str, Any]
) -> None:
    """Mute everyone but the host (§6.7 drawer footer)."""
    with _db() as db:
        actor = _actor(db, connection)
        updated_rows = signaling_service.host_mute_all(db, actor)

    for row in updated_rows:
        await registry.send_to_participant(
            connection.meeting_id,
            row["id"],
            p.frame(
                p.HOST_MUTED_YOU,
                {"by": connection.participant_id},
                sender=connection.participant_id,
                to=row["id"],
            ),
        )
        await _broadcast_peer_updated(connection, row)


async def _handle_host_remove(
    connection: Connection, message: dict[str, Any], payload: dict[str, Any]
) -> None:
    """Host evicts a participant (§6.7)."""
    target_id = payload.get("participant_id")
    if not isinstance(target_id, str) or not target_id:
        raise _bad_request("`participant_id` is required.")

    with _db() as db:
        actor = _actor(db, connection)
        signaling_service.host_remove(db, actor, target_id)

    # Tell the target first, then the room. The target's socket is closed here
    # rather than waiting for it to disconnect itself, so a client that ignores
    # the frame still loses its media path.
    await registry.send_to_participant(
        connection.meeting_id,
        target_id,
        p.frame(
            p.HOST_REMOVED_YOU,
            {"by": connection.participant_id},
            sender=connection.participant_id,
            to=target_id,
        ),
    )
    await registry.broadcast(
        connection.meeting_id,
        p.frame(
            p.PEER_LEFT, {"participant_id": target_id}, sender=connection.participant_id
        ),
    )
    await _close_participant(connection.meeting_id, target_id, p.CLOSE_REMOVED)


async def _handle_host_end(
    connection: Connection, message: dict[str, Any], payload: dict[str, Any]
) -> None:
    """End for all (§6.7 End popover, §5.4).

    Available over the socket as well as `POST /meetings/{n}/end` because the
    room already holds a live authorized session; requiring a bearer token here
    would break End for a guest-hosted meeting whose HTTP token has aged out.
    """
    with _db() as db:
        actor = _actor(db, connection)
        signaling_service.host_end_meeting(db, actor)

    await registry.broadcast(
        connection.meeting_id,
        p.frame(
            p.MEETING_ENDED,
            {"by": connection.participant_id},
            sender=connection.participant_id,
        ),
    )
    for peer in registry.connections(connection.meeting_id):
        if peer.connection_id == connection.connection_id:
            continue
        await _close_connection(peer, p.CLOSE_MEETING_ENDED)


_HANDLERS: dict[
    str, Callable[[Connection, dict[str, Any], dict[str, Any]], Awaitable[None]]
] = {
    p.PING: _handle_ping,
    p.SIGNAL_OFFER: _handle_signal,
    p.SIGNAL_ANSWER: _handle_signal,
    p.SIGNAL_ICE: _handle_signal,
    p.STATE_UPDATE: _handle_state_update,
    p.CHAT_SEND: _handle_chat_send,
    p.HOST_MUTE: _handle_host_mute,
    p.HOST_MUTE_ALL: _handle_host_mute_all,
    p.HOST_REMOVE: _handle_host_remove,
    p.HOST_END: _handle_host_end,
}


# --- Helpers ------------------------------------------------------------------


def _bad_request(message: str, *, code: str = "BAD_FRAME") -> AppError:
    return AppError(message, code=code, status_code=400)


def _actor(db: Session, connection: Connection):
    """Re-read the acting participant from the DB on every host frame.

    Never cached on the Connection: a host removed or demoted mid-meeting must
    lose host tools immediately, and a cached row would keep granting them.
    """
    from app.models import Participant

    actor = db.get(Participant, connection.participant_id)
    if actor is None:
        raise signaling_service.InvalidSession()
    return actor


async def _broadcast_peer_updated(
    connection: Connection, participant: dict[str, Any]
) -> None:
    await registry.broadcast(
        connection.meeting_id,
        p.frame(
            p.PEER_UPDATED,
            {
                "participant_id": participant["id"],
                "is_muted": participant["is_muted"],
                "is_video_on": participant["is_video_on"],
                "is_hand_raised": participant["is_hand_raised"],
            },
            sender=connection.participant_id,
        ),
    )


async def _close_participant(meeting_id: str, participant_id: str, code: int) -> None:
    target = registry.find(meeting_id, participant_id)
    if target is not None:
        await _close_connection(target, code)


async def _close_connection(connection: Connection, code: int) -> None:
    registry.remove(connection)
    try:
        await connection.websocket.close(code=code)
    except Exception:
        logger.debug("close failed for %s", connection.connection_id, exc_info=True)


__all__ = ["router"]
