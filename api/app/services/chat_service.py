"""Chat history persistence (§4, §6.7).

Messages persist so the chat drawer survives a refresh. Reads are always
(meeting_id, sent_at), matching the §3.2 index.
"""

from __future__ import annotations

from typing import Any

from sqlmodel import Session, select

from app.models import MAX_CHAT_BODY_LENGTH, ChatMessage, Participant, User
from app.services.errors import NotFoundError, ValidationError
from app.services.meeting_service import get_by_number
from app.services.participant_service import require_membership

DEFAULT_MESSAGE_LIMIT = 200


def serialize_message(message: ChatMessage, display_name: str) -> dict[str, Any]:
    """Matches the §5.2 `chat.message` frame so the REST history and the live
    socket feed render through the same client-side code path."""
    return {
        "id": message.id,
        "meeting_id": message.meeting_id,
        "participant_id": message.participant_id,
        "display_name": display_name,
        "body": message.body,
        "sent_at": message.sent_at,
    }


def list_messages(
    session: Session,
    meeting_number: str,
    viewer: User,
    *,
    limit: int = DEFAULT_MESSAGE_LIMIT,
) -> list[dict[str, Any]]:
    """Chat history for a participant of the meeting (§4)."""
    meeting = get_by_number(session, meeting_number)
    require_membership(session, meeting, viewer)

    limit = max(1, min(limit, DEFAULT_MESSAGE_LIMIT))
    # One join rather than N lookups: a busy room's history would otherwise be
    # a per-message SELECT on participants.
    rows = session.exec(
        select(ChatMessage, Participant.display_name)
        .join(Participant, Participant.id == ChatMessage.participant_id)
        .where(ChatMessage.meeting_id == meeting.id)
        .order_by(ChatMessage.sent_at.asc())
        .limit(limit)
    ).all()
    return [serialize_message(msg, name) for msg, name in rows]


def post_message(
    session: Session, meeting_id: str, participant_id: str, body: str
) -> dict[str, Any]:
    """Persist one message. Used by the REST layer and, from P9, the WS handler.

    Trimmed and length-capped server-side (§5.2) — the client's own limit is a
    convenience, not a control.
    """
    body = body.strip()
    if not body:
        raise ValidationError("Message body cannot be empty.", details={"field": "body"})
    if len(body) > MAX_CHAT_BODY_LENGTH:
        body = body[:MAX_CHAT_BODY_LENGTH]

    participant = session.get(Participant, participant_id)
    if participant is None or participant.meeting_id != meeting_id:
        raise NotFoundError(
            "No such participant in this meeting.", code="PARTICIPANT_NOT_FOUND"
        )

    message = ChatMessage(
        meeting_id=meeting_id, participant_id=participant_id, body=body
    )
    session.add(message)
    session.commit()
    session.refresh(message)
    return serialize_message(message, participant.display_name)


__all__ = ["list_messages", "post_message", "serialize_message"]
