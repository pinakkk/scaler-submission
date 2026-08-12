"""In-process room state: meeting -> live connections (§5.2, §12.2).

This is a plain dict, not Redis, and that is a deliberate constraint: the API
runs a single uvicorn worker (`--workers 1`, §12.2) precisely so this map stays
coherent. §9 records the consequence — if the API ever scales past one instance,
this must move to Redis pub/sub, because in-process room state does not survive
replication.

Nothing here touches the database. The registry knows which sockets exist and
how to reach them; whether a frame is *allowed* is decided in
`services.signaling_service` against the DB (§1.3).
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any
from uuid import uuid4

from fastapi import WebSocket

from app.realtime.protocol import encode_frame

logger = logging.getLogger("app.realtime")


@dataclass(slots=True)
class Connection:
    """One live socket, keyed by a per-connection id rather than by participant.

    `connection_id` is distinct from `participant_id` because a fast refresh can
    briefly have two sockets for the same participant row; the id is what lets
    the disconnect handler tell "my socket closed" from "an older socket of mine
    closed after I already reconnected".
    """

    connection_id: str
    participant_id: str
    meeting_id: str
    websocket: WebSocket
    # Serializes sends on this socket. Two coroutines writing to one WebSocket
    # concurrently (a broadcast and a direct relay, say) can interleave frames
    # and corrupt the stream, and Starlette does not lock internally.
    send_lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def send(self, message: dict[str, Any]) -> bool:
        """Send one frame. Returns False when the socket is already gone.

        A dead peer must never propagate an exception into the sender's own
        message loop — one client closing its laptop lid would otherwise tear
        down whoever happened to be broadcasting at that moment.

        Encoding happens *before* the try/except on purpose. A frame carrying a
        value the wire format cannot represent (a bare `datetime` off a model
        row, say) is a bug in this process, not a dead peer, and it must not be
        swallowed as one: doing so drops the frame silently and leaves the client
        blocked forever on a `receive` that will never resolve. Transport errors
        below are still absorbed; serialization errors are raised.
        """
        text = encode_frame(message)
        try:
            async with self.send_lock:
                await self.websocket.send_text(text)
            return True
        except Exception:
            logger.debug(
                "dropping frame to closed socket %s", self.connection_id, exc_info=True
            )
            return False


class RoomRegistry:
    """`Map<meeting_id, Map<connection_id, Connection>>` (§1.1)."""

    def __init__(self) -> None:
        self._rooms: dict[str, dict[str, Connection]] = {}

    # --- Membership ---------------------------------------------------------

    def add(
        self, meeting_id: str, participant_id: str, websocket: WebSocket
    ) -> Connection:
        connection = Connection(
            connection_id=uuid4().hex,
            participant_id=participant_id,
            meeting_id=meeting_id,
            websocket=websocket,
        )
        self._rooms.setdefault(meeting_id, {})[connection.connection_id] = connection
        return connection

    def remove(self, connection: Connection) -> None:
        room = self._rooms.get(connection.meeting_id)
        if room is None:
            return
        room.pop(connection.connection_id, None)
        # Drop empty rooms so a long-running process does not accumulate one
        # entry per meeting ever held.
        if not room:
            self._rooms.pop(connection.meeting_id, None)

    def connections(self, meeting_id: str) -> list[Connection]:
        return list(self._rooms.get(meeting_id, {}).values())

    def participant_ids(self, meeting_id: str) -> set[str]:
        return {c.participant_id for c in self.connections(meeting_id)}

    def find(self, meeting_id: str, participant_id: str) -> Connection | None:
        """The live socket for a participant, if any.

        Returns the most recently added one: after a refresh the newest socket is
        the one the user is actually looking at.
        """
        matches = [
            c
            for c in self._rooms.get(meeting_id, {}).values()
            if c.participant_id == participant_id
        ]
        return matches[-1] if matches else None

    def is_in_room(self, meeting_id: str, participant_id: str) -> bool:
        """§5.2 — relay `signal.*` only after confirming both peers are here."""
        return self.find(meeting_id, participant_id) is not None

    def size(self, meeting_id: str) -> int:
        """Distinct participants present, not sockets — a duplicate socket from a
        mid-refresh client must not count against the §5.1 mesh cap."""
        return len(self.participant_ids(meeting_id))

    # --- Fan-out ------------------------------------------------------------

    async def broadcast(
        self,
        meeting_id: str,
        message: dict[str, Any],
        *,
        exclude: str | None = None,
    ) -> None:
        """Send to every socket in the room, optionally skipping one connection.

        `exclude` is a *connection* id, not a participant id: a client that
        refreshed still has a stale socket in the room and must receive frames on
        its new one.
        """
        targets = [
            c for c in self.connections(meeting_id) if c.connection_id != exclude
        ]
        if not targets:
            return
        await asyncio.gather(*(c.send(message) for c in targets))

    async def send_to_participant(
        self, meeting_id: str, participant_id: str, message: dict[str, Any]
    ) -> bool:
        connection = self.find(meeting_id, participant_id)
        if connection is None:
            return False
        return await connection.send(message)


# Module-level singleton: one process, one registry (§12.2).
registry = RoomRegistry()

__all__ = ["Connection", "RoomRegistry", "registry"]
