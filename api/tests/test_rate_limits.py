"""Rate limits from §4.

`/lookup` and `/join` are the enumeration-exposed endpoints (10/min per IP);
`POST /meetings` is 30/min. These are the only defence against someone walking
the 11-digit meeting-number space, so they are asserted rather than assumed.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.main import app
from app.models import User
from app.services.auth_service import create_access_token

API = "/api/v1"


@pytest.fixture
def api(session: Session) -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


def auth(user: User) -> dict[str, str]:
    token, _ = create_access_token(user)
    return {"Authorization": f"Bearer {token}"}


def test_lookup_is_limited_to_ten_per_minute(api: TestClient, host: User) -> None:
    created = api.post(
        f"{API}/meetings", json={"topic": "Rate"}, headers=auth(host)
    ).json()
    number = created["meeting_number"]

    codes = [
        api.get(f"{API}/meetings/{number}/lookup").status_code for _ in range(11)
    ]
    assert codes[:10] == [200] * 10
    assert codes[10] == 429


def test_join_is_limited_to_ten_per_minute(
    api: TestClient, host: User, joiner: User
) -> None:
    created = api.post(
        f"{API}/meetings", json={"topic": "Rate"}, headers=auth(host)
    ).json()
    number = created["meeting_number"]
    body = {"passcode": "definitely-wrong"}

    codes = [
        api.post(
            f"{API}/meetings/{number}/join", json=body, headers=auth(joiner)
        ).status_code
        for _ in range(11)
    ]
    # Wrong passcode => 403; what matters is the 11th being refused by the limiter.
    assert codes[:10] == [403] * 10
    assert codes[10] == 429


def test_meeting_creation_is_limited_to_thirty_per_minute(
    api: TestClient, host: User
) -> None:
    codes = [
        api.post(
            f"{API}/meetings", json={"topic": f"M{i}"}, headers=auth(host)
        ).status_code
        for i in range(31)
    ]
    assert codes[:30] == [201] * 30
    assert codes[30] == 429


def test_a_rate_limited_response_still_uses_the_error_envelope(
    api: TestClient, host: User
) -> None:
    """The frontend parses one error shape (§4) — 429 must not be an exception."""
    created = api.post(
        f"{API}/meetings", json={"topic": "Rate"}, headers=auth(host)
    ).json()
    number = created["meeting_number"]
    for _ in range(11):
        response = api.get(f"{API}/meetings/{number}/lookup")

    assert response.status_code == 429
    body = response.json()
    assert set(body) == {"error"}
    assert body["error"]["code"] == "RATE_LIMITED"
