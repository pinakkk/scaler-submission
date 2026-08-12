"""Auth request/response contracts (§4, §8)."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.user import UserOut


class GuestAuthRequest(BaseModel):
    display_name: str = Field(
        min_length=1, max_length=50, description="Name shown in the meeting (§6.5)."
    )


class GoogleAuthRequest(BaseModel):
    id_token: str = Field(description="Google ID token from the OAuth callback.")


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = Field(description="Token lifetime in seconds.")
    user: UserOut
