"""Shared FastAPI dependencies: session, current user, guest gating (§1.3, §8).

These live in the router layer because they are HTTP concerns — pulling a bearer
token off a request header. The actual token verification is delegated to
`services.auth_service`.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request
from sqlmodel import Session

from app.database import get_session
from app.models import User
from app.services.auth_service import InvalidToken, get_user_by_token
from app.services.errors import ForbiddenError, UnauthorizedError

SessionDep = Annotated[Session, Depends(get_session)]


def _bearer_token(request: Request) -> str | None:
    header = request.headers.get("authorization")
    if not header:
        return None
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()


def current_user(request: Request, session: SessionDep) -> User:
    """Require a valid bearer token. 401 otherwise."""
    token = _bearer_token(request)
    if token is None:
        raise UnauthorizedError("Authentication is required.", code="UNAUTHENTICATED")
    return get_user_by_token(session, token)


def optional_user(request: Request, session: SessionDep) -> User | None:
    """Resolve the caller if a token is present, else None.

    Used by endpoints that behave differently for signed-in callers but must
    still serve anonymous ones. A malformed token is treated as absent rather
    than fatal — the anonymous path is a valid outcome here.
    """
    token = _bearer_token(request)
    if token is None:
        return None
    try:
        return get_user_by_token(session, token)
    except InvalidToken:
        return None


def current_full_user(user: Annotated[User, Depends(current_user)]) -> User:
    """Require a non-guest account.

    §8: guests cannot list meetings, schedule, or hold host tools. Checked
    against the DB row, not the JWT claim, so revoking guest status takes effect
    without waiting for the token to expire.
    """
    if user.is_guest:
        raise ForbiddenError(
            "Guests cannot use this feature. Sign in to continue.",
            code="GUEST_FORBIDDEN",
        )
    return user


CurrentUser = Annotated[User, Depends(current_user)]
FullUser = Annotated[User, Depends(current_full_user)]
OptionalUser = Annotated[User | None, Depends(optional_user)]
