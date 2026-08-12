"""Participant routes (§4). Authorization is decided in the service (§1.3)."""

from __future__ import annotations

from fastapi import APIRouter

from app.routers.deps import CurrentUser, SessionDep
from app.schemas.meeting import ParticipantOut, ParticipantUpdate
from app.services import participant_service

router = APIRouter(prefix="/participants", tags=["participants"])


@router.patch(
    "/{participant_id}", response_model=ParticipantOut, summary="Mute / video toggle"
)
def update_participant(
    participant_id: str,
    payload: ParticipantUpdate,
    session: SessionDep,
    user: CurrentUser,
) -> ParticipantOut:
    """Self or host (§4) — the service checks which, against the DB row."""
    return participant_service.update_participant(
        session, participant_id, user, payload.model_dump(exclude_unset=True)
    )


@router.delete(
    "/{participant_id}", response_model=ParticipantOut, summary="Remove from meeting"
)
def remove_participant(
    participant_id: str, session: SessionDep, user: CurrentUser
) -> ParticipantOut:
    """Host-only. Sets `left_at` rather than deleting — the row is the audit
    record of that join (§3.2)."""
    return participant_service.remove_participant(session, participant_id, user)
