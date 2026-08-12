"""Auth routes (§4, §8). Parse, delegate, serialize — no logic here (§1.3)."""

from __future__ import annotations

from fastapi import APIRouter, Request

from app.routers.deps import SessionDep
from app.schemas.auth import (
    DevAuthRequest,
    GoogleAuthRequest,
    GuestAuthRequest,
    TokenResponse,
)
from app.services import auth_service, user_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/guest", response_model=TokenResponse, summary="Create a guest identity")
def create_guest(
    request: Request, payload: GuestAuthRequest, session: SessionDep
) -> TokenResponse:
    """Guest join path (§8): a real user row with `is_guest=true` and a 4h JWT."""
    user, token, expires_in = auth_service.create_guest(session, payload.display_name)
    return TokenResponse(
        access_token=token,
        expires_in=expires_in,
        user=user_service.serialize_user(user),
    )


@router.post(
    "/dev",
    response_model=TokenResponse,
    summary="Local-only sign-in as a seeded account",
    include_in_schema=False,
)
def dev_auth(
    request: Request, payload: DevAuthRequest, session: SessionDep
) -> TokenResponse:
    """Sign in as an existing seeded user without credentials.

    Exists so the frontend has a working host identity before P12 lands Google
    OAuth. The service refuses to run when `ENVIRONMENT=production` and will
    only ever sign in an account the seed created — it cannot mint new users.
    """
    user, token, expires_in = auth_service.sign_in_dev_user(session, payload.email)
    return TokenResponse(
        access_token=token,
        expires_in=expires_in,
        user=user_service.serialize_user(user),
    )


@router.post(
    "/google", response_model=TokenResponse, summary="Exchange a Google ID token"
)
def google_auth(
    request: Request, payload: GoogleAuthRequest, session: SessionDep
) -> TokenResponse:
    """Verify a Google ID token against Google's JWKS, then upsert the user (§8).

    Verification is real (`google-auth`), never a client-side decode. Returns
    501 when `GOOGLE_CLIENT_ID` is unset, because without an expected audience
    there is nothing meaningful to validate against.
    """
    claims = auth_service.verify_google_id_token(payload.id_token)
    user = auth_service.upsert_google_user(session, claims)
    token, expires_in = auth_service.create_access_token(user)
    return TokenResponse(
        access_token=token,
        expires_in=expires_in,
        user=user_service.serialize_user(user),
    )
