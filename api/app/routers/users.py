"""Current-user routes (§4)."""

from __future__ import annotations

from fastapi import APIRouter

from app.routers.deps import CurrentUser, SessionDep
from app.schemas.user import PreferencesOut, PreferencesUpdate, UserOut, UserUpdate
from app.services import user_service

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut, summary="Current user, plan, and PMI")
def read_me(user: CurrentUser) -> UserOut:
    return user_service.serialize_user(user)


@router.patch("/me", response_model=UserOut, summary="Update display name / avatar")
def update_me(payload: UserUpdate, user: CurrentUser, session: SessionDep) -> UserOut:
    # exclude_unset so an omitted `avatar_url` is left alone while an explicit
    # null clears it — the two are different intents.
    return user_service.update_profile(
        session, user, payload.model_dump(exclude_unset=True)
    )


@router.get(
    "/me/preferences",
    response_model=PreferencesOut,
    summary="Settings values, with defaults when no row exists",
)
def read_preferences(user: CurrentUser, session: SessionDep) -> PreferencesOut:
    return user_service.get_preferences(session, user)


@router.put(
    "/me/preferences",
    response_model=PreferencesOut,
    summary="Upsert preferences from the Settings modal",
)
def write_preferences(
    payload: PreferencesUpdate, user: CurrentUser, session: SessionDep
) -> PreferencesOut:
    return user_service.upsert_preferences(
        session, user, payload.model_dump(exclude_unset=True)
    )
