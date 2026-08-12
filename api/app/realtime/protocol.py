"""Wire format for the signaling socket (§5.2).

Every frame on the wire is exactly:

    { "type": str, "from": participant_id | None, "to": participant_id | None,
      "payload": object, "ts": epoch_ms }

`to: null` means broadcast to the room. Frame *names* are constants rather than
string literals at call sites so a typo is an ImportError instead of a message
that is silently never delivered.
"""

from __future__ import annotations

import json
import time
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Final
from uuid import UUID

# --- Server -> client (§5.2) --------------------------------------------------
ROOM_STATE: Final = "room.state"
PEER_JOINED: Final = "peer.joined"
PEER_LEFT: Final = "peer.left"
PEER_UPDATED: Final = "peer.updated"
CHAT_MESSAGE: Final = "chat.message"
HOST_MUTED_YOU: Final = "host.muted_you"
HOST_REMOVED_YOU: Final = "host.removed_you"
MEETING_ENDED: Final = "meeting.ended"
ERROR: Final = "error"
PONG: Final = "pong"

# --- Client -> server (§5.2) --------------------------------------------------
STATE_UPDATE: Final = "state.update"
CHAT_SEND: Final = "chat.send"
HOST_MUTE: Final = "host.mute"
HOST_MUTE_ALL: Final = "host.mute_all"
HOST_REMOVE: Final = "host.remove"
HOST_END: Final = "host.end"
PING: Final = "ping"

# --- Bidirectional relay (§5.2) ----------------------------------------------
# These travel client -> server -> client verbatim; the server only decides
# *whether* to relay, never rewrites the SDP or candidate.
SIGNAL_OFFER: Final = "signal.offer"
SIGNAL_ANSWER: Final = "signal.answer"
SIGNAL_ICE: Final = "signal.ice"
SIGNAL_TYPES: Final[frozenset[str]] = frozenset(
    {SIGNAL_OFFER, SIGNAL_ANSWER, SIGNAL_ICE}
)

HOST_TYPES: Final[frozenset[str]] = frozenset(
    {HOST_MUTE, HOST_MUTE_ALL, HOST_REMOVE, HOST_END}
)

# WebSocket close codes. 4401 is mandated by §5.2 for a failed `session_id`.
CLOSE_UNAUTHORIZED: Final = 4401
CLOSE_MEETING_FULL: Final = 4403
CLOSE_REMOVED: Final = 4404
CLOSE_MEETING_ENDED: Final = 4405


def now_ms() -> int:
    return int(time.time() * 1000)


def frame(
    type_: str,
    payload: dict[str, Any] | None = None,
    *,
    sender: str | None = None,
    to: str | None = None,
) -> dict[str, Any]:
    """Build one envelope. The single place the §5.2 shape is constructed.

    `sender`/`to` rather than `from`/`to` because `from` is a Python keyword;
    the wire keys are still `from` and `to`.
    """
    return {
        "type": type_,
        "from": sender,
        "to": to,
        "payload": payload or {},
        "ts": now_ms(),
    }


def encode_frame(message: dict[str, Any]) -> str:
    """Render one frame as the JSON text that goes on the wire.

    The service serializers are shared with REST, where FastAPI's
    `jsonable_encoder` converts `datetime` on the way out. The WebSocket path has
    no such step, so a roster row's `joined_at` would reach `json.dumps` as a
    bare `datetime` and raise. Encoding centrally here — rather than teaching
    each serializer about the socket — keeps one wire format and one place to fix
    it, and matches REST's ISO-8601 output so the client parses both identically.
    """
    return json.dumps(message, default=_json_default)


def _json_default(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, UUID):
        return str(value)
    raise TypeError(f"{type(value).__name__} is not valid on the signaling wire")


def error_frame(code: str, message: str, **details: Any) -> dict[str, Any]:
    """The §5.2 `error` frame. Mirrors the REST envelope's `{code, message}` so
    the client can surface socket and HTTP failures through one code path."""
    payload: dict[str, Any] = {"code": code, "message": message}
    if details:
        payload["details"] = details
    return frame(ERROR, payload)


__all__ = [
    "CHAT_MESSAGE",
    "CHAT_SEND",
    "CLOSE_MEETING_ENDED",
    "CLOSE_MEETING_FULL",
    "CLOSE_REMOVED",
    "CLOSE_UNAUTHORIZED",
    "ERROR",
    "HOST_END",
    "HOST_MUTE",
    "HOST_MUTE_ALL",
    "HOST_MUTED_YOU",
    "HOST_REMOVE",
    "HOST_REMOVED_YOU",
    "HOST_TYPES",
    "MEETING_ENDED",
    "PEER_JOINED",
    "PEER_LEFT",
    "PEER_UPDATED",
    "PING",
    "PONG",
    "ROOM_STATE",
    "SIGNAL_ANSWER",
    "SIGNAL_ICE",
    "SIGNAL_OFFER",
    "SIGNAL_TYPES",
    "STATE_UPDATE",
    "encode_frame",
    "error_frame",
    "frame",
    "now_ms",
]
