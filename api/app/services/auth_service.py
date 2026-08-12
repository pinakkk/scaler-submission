"""Identity: JWT mint/verify, guest creation, Google ID-token exchange (§8).

Full Google OAuth is P12; the token-exchange path here is real (verified against
Google's JWKS via `google-auth`), so P12 only has to wire the frontend to it.
Guests get a real `users` row per §3.2 so `participants.user_id` is never null.
"""

from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from typing import Any, Final

import jwt
from sqlmodel import Session, select

from app.config import settings
from app.models import User
from app.services.errors import UnauthorizedError, ValidationError
from app.services.security import allocate_meeting_number

JWT_ALGORITHM: Final = "HS256"
GUEST_TOKEN_TTL_HOURS: Final = 4  # §8 — guest sessions are short-lived
USER_TOKEN_TTL_HOURS: Final = 24 * 7
GUEST_EMAIL_DOMAIN: Final = "guest.zoomclone.local"

MAX_DISPLAY_NAME_LENGTH: Final = 50


class InvalidToken(UnauthorizedError):
    code = "INVALID_TOKEN"
    message = "The session token is missing, expired, or invalid."


class GoogleAuthUnavailable(UnauthorizedError):
    status_code = 501
    code = "GOOGLE_AUTH_UNCONFIGURED"
    message = "Google sign-in is not configured on this server."


def create_access_token(user: User, *, ttl_hours: int | None = None) -> tuple[str, int]:
    """Mint an app JWT. Returns `(token, expires_in_seconds)`.

    `is_guest` rides in the claims so guest-gating (§8) does not need a DB read
    on every request — but it is re-checked against the row in `current_user`,
    since a claim is a cache, never an authority.
    """
    if ttl_hours is None:
        ttl_hours = GUEST_TOKEN_TTL_HOURS if user.is_guest else USER_TOKEN_TTL_HOURS
    now = datetime.now(UTC)
    expires_at = now + timedelta(hours=ttl_hours)
    payload = {
        "sub": user.id,
        "email": user.email,
        "name": user.name,
        "is_guest": user.is_guest,
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm=JWT_ALGORITHM)
    return token, ttl_hours * 3600


def decode_access_token(token: str) -> dict[str, Any]:
    """Verify signature and expiry, returning the claims."""
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise InvalidToken("Your session has expired. Please sign in again.") from exc
    except jwt.PyJWTError as exc:
        raise InvalidToken() from exc


def get_user_by_token(session: Session, token: str) -> User:
    """Resolve a bearer token to a live `users` row."""
    claims = decode_access_token(token)
    user_id = claims.get("sub")
    if not isinstance(user_id, str):
        raise InvalidToken()
    user = session.get(User, user_id)
    if user is None:
        # Token signed correctly but the user is gone — treat as unauthenticated
        # rather than 404, so we never confirm which ids once existed.
        raise InvalidToken()
    return user


def normalize_display_name(raw: str) -> str:
    """Trim and bound a user-supplied name (§6.5: required, 1-50 chars)."""
    name = " ".join(raw.split())
    if not name:
        raise ValidationError(
            "A display name is required.", details={"field": "display_name"}
        )
    if len(name) > MAX_DISPLAY_NAME_LENGTH:
        raise ValidationError(
            f"Display name must be {MAX_DISPLAY_NAME_LENGTH} characters or fewer.",
            details={"field": "display_name"},
        )
    return name


def create_guest(session: Session, display_name: str) -> tuple[User, str, int]:
    """Create a guest identity and mint its 4h token (§8).

    The synthetic email is unique-by-construction rather than derived from the
    name: two guests called "Alex" must not collide on the unique email index.
    """
    name = normalize_display_name(display_name)
    user = User(
        google_id=None,
        email=f"guest-{secrets.token_hex(8)}@{GUEST_EMAIL_DOMAIN}",
        name=name,
        avatar_url=None,
        personal_meeting_id=allocate_meeting_number(session),
        plan="basic",
        is_guest=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    token, expires_in = create_access_token(user)
    return user, token, expires_in


def verify_google_id_token(id_token_str: str) -> dict[str, Any]:
    """Verify a Google ID token against Google's JWKS (§8).

    Never trust a client-decoded profile — `google-auth` fetches and caches
    Google's signing keys and checks signature, issuer, audience, and expiry.
    """
    if not settings.GOOGLE_CLIENT_ID:
        raise GoogleAuthUnavailable(
            "GOOGLE_CLIENT_ID is not set; the API cannot validate the token audience."
        )
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token as google_id_token

    try:
        claims = google_id_token.verify_oauth2_token(
            id_token_str,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID,
        )
    except ValueError as exc:
        raise InvalidToken("Google ID token verification failed.") from exc

    if claims.get("iss") not in {"accounts.google.com", "https://accounts.google.com"}:
        raise InvalidToken("Unexpected token issuer.")
    if not claims.get("sub"):
        raise InvalidToken("Google token is missing a subject claim.")
    return claims


def upsert_google_user(session: Session, claims: dict[str, Any]) -> User:
    """Find-or-create the app user behind a verified Google identity (§8).

    Matches on `google_id` first, then falls back to email so a user who was
    first seen as an invitee row is adopted rather than duplicated. A PMI is
    minted on first sight (§3.2).
    """
    google_id = str(claims["sub"])
    email = claims.get("email")
    if not email:
        raise ValidationError("Google token did not include an email address.")

    user = session.exec(select(User).where(User.google_id == google_id)).first()
    if user is None:
        user = session.exec(select(User).where(User.email == email)).first()

    if user is None:
        user = User(
            google_id=google_id,
            email=email,
            name=claims.get("name") or email.split("@")[0],
            avatar_url=claims.get("picture"),
            personal_meeting_id=allocate_meeting_number(session),
            plan="basic",
            is_guest=False,
        )
        session.add(user)
    else:
        user.google_id = google_id
        user.email = email
        if claims.get("name"):
            user.name = claims["name"]
        if claims.get("picture"):
            user.avatar_url = claims["picture"]
        # A previously-guest row that signs in with Google is promoted.
        user.is_guest = False
        session.add(user)

    session.commit()
    session.refresh(user)
    return user
