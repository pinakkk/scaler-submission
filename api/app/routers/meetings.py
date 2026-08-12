"""Meeting routes (§4). HTTP only — every decision is made in the services (§1.3).

Rate limits come from §4: `/lookup` and `/join` are the enumeration-exposed
endpoints (10/min per IP); `POST /meetings` is 30/min.
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Query, Request

from app.rate_limit import limiter
from app.routers.deps import CurrentUser, FullUser, SessionDep
from app.schemas.meeting import (
    ChatMessageOut,
    JoinRequest,
    JoinResponse,
    MeetingCreate,
    MeetingListOut,
    MeetingLookupOut,
    MeetingOut,
    MeetingUpdate,
    ParticipantOut,
)
from app.services import chat_service, meeting_service, participant_service

router = APIRouter(prefix="/meetings", tags=["meetings"])


# --- List / create -----------------------------------------------------------


@router.get("", response_model=MeetingListOut, summary="List the caller's meetings")
def list_meetings(
    session: SessionDep,
    # FullUser, not CurrentUser: §8 blocks guests from listing meetings.
    user: FullUser,
    filter: Literal["upcoming", "recent", "day", "all"] = Query(
        default="upcoming", description="§4 filters plus §6.2's day strip filter."
    ),
    date: str | None = Query(
        default=None, description="YYYY-MM-DD. Required when filter=day (§6.2)."
    ),
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = Query(default=None, description="Id of the last row seen."),
) -> MeetingListOut:
    return meeting_service.list_for_host(
        session, user, filter_=filter, date=date, limit=limit, cursor=cursor
    )


@router.post("", response_model=MeetingOut, status_code=201, summary="Create a meeting")
@limiter.limit("30/minute")
def create_meeting(
    request: Request, payload: MeetingCreate, session: SessionDep, user: FullUser
) -> MeetingOut:
    """Instant when `scheduled_start` is omitted, scheduled otherwise (§3.2)."""
    return meeting_service.create_meeting(
        session, user, **payload.model_dump(exclude_unset=True)
    )


# --- Unauthenticated pre-join ------------------------------------------------
# Declared before /{number} so the literal path segments win the route match.


@router.get(
    "/{number}/lookup",
    response_model=MeetingLookupOut,
    summary="Pre-join probe (unauthenticated)",
)
@limiter.limit("10/minute")
def lookup_meeting(
    request: Request, number: str, session: SessionDep
) -> MeetingLookupOut:
    """Existence + topic + passcode_required, and nothing else (§4).

    No auth dependency by design: the join page must render a topic before it
    can ask for a passcode. The response model is a closed shape, so nothing
    private can slip through even if the service returned more.
    """
    return meeting_service.lookup(session, number)


@router.post("/{number}/join", response_model=JoinResponse, summary="Join a meeting")
@limiter.limit("10/minute")
def join_meeting(
    request: Request,
    number: str,
    payload: JoinRequest,
    session: SessionDep,
    user: CurrentUser,
) -> JoinResponse:
    """Validate the passcode, create a participant row, return the session (§4).

    Requires *an* identity but not a full account — a guest token from
    `/auth/guest` is the intended path (§8), which is why `participants.user_id`
    is always populated (§3.2).
    """
    return participant_service.join_meeting(
        session,
        number,
        user=user,
        display_name=payload.display_name,
        passcode=payload.passcode,
        invite_token=payload.invite_token,
    )


# --- Detail / edit / cancel --------------------------------------------------


@router.get("/{number}", response_model=MeetingOut, summary="Meeting detail")
def get_meeting(number: str, session: SessionDep, user: CurrentUser) -> MeetingOut:
    """Host or an authenticated participant (§4). Carries passcode + invite token."""
    return meeting_service.get_detail(session, number, user)


@router.patch("/{number}", response_model=MeetingOut, summary="Edit a scheduled meeting")
def update_meeting(
    number: str, payload: MeetingUpdate, session: SessionDep, user: FullUser
) -> MeetingOut:
    return meeting_service.update_meeting(
        session, number, user, payload.model_dump(exclude_unset=True)
    )


@router.delete("/{number}", response_model=MeetingOut, summary="Cancel a meeting")
def cancel_meeting(number: str, session: SessionDep, user: FullUser) -> MeetingOut:
    """`scheduled` -> `cancelled` (§5.4). 409 from any other state."""
    return meeting_service.cancel_meeting(session, number, user)


# --- State transitions (§5.4) ------------------------------------------------


@router.post("/{number}/start", response_model=MeetingOut, summary="Start a meeting")
def start_meeting(number: str, session: SessionDep, user: FullUser) -> MeetingOut:
    """`scheduled | ended` -> `live`. Illegal sources raise 409."""
    return meeting_service.start_meeting(session, number, user)


@router.post("/{number}/end", response_model=MeetingOut, summary="End a meeting")
def end_meeting(number: str, session: SessionDep, user: FullUser) -> MeetingOut:
    """`live` -> `ended`, evicting every active participant."""
    return meeting_service.end_meeting(session, number, user)


# --- Roster and chat ---------------------------------------------------------


@router.get(
    "/{number}/participants",
    response_model=list[ParticipantOut],
    summary="Active participants",
)
def list_participants(
    number: str, session: SessionDep, user: CurrentUser
) -> list[ParticipantOut]:
    return participant_service.list_active(session, number, user)


@router.get(
    "/{number}/messages", response_model=list[ChatMessageOut], summary="Chat history"
)
def list_messages(
    number: str,
    session: SessionDep,
    user: CurrentUser,
    limit: int = Query(default=200, ge=1, le=200),
) -> list[ChatMessageOut]:
    return chat_service.list_messages(session, number, user, limit=limit)
