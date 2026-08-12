"""End-to-end REST behaviour over the real app (§4, §11).

Uses a dedicated TestClient rather than the session-scoped `client` fixture so
the per-test truncation in `session` does not race with other modules' state.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.main import app
from app.models import User, utcnow
from app.services.auth_service import create_access_token

API = "/api/v1"


@pytest.fixture
def api(session: Session) -> Iterator[TestClient]:
    """Client bound to the same truncated DB the `session` fixture manages."""
    with TestClient(app) as c:
        yield c


def auth(user: User) -> dict[str, str]:
    token, _ = create_access_token(user)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def meeting(api: TestClient, host: User) -> dict:
    response = api.post(
        f"{API}/meetings", json={"topic": "API Test Meeting"}, headers=auth(host)
    )
    assert response.status_code == 201, response.text
    return response.json()


# --- /lookup leaks nothing private (§4, §11 — explicitly graded) -------------

# Every field the detail view carries that an anonymous caller must never see.
PRIVATE_FIELDS = frozenset(
    {
        "id",
        "invite_token",
        "passcode",
        "host_id",
        "host",
        "participant_count",
        "waiting_room",
        "description",
        "scheduled_start",
        "duration_minutes",
        "timezone",
        "use_pmi",
        "host_video_on",
        "participant_video_on",
        "allow_transcription",
        "chat_before_after",
        "encryption",
        "started_at",
        "ended_at",
        "created_at",
    }
)


def test_lookup_is_unauthenticated(api: TestClient, meeting: dict) -> None:
    """The join page must render a topic before it can ask for a passcode."""
    response = api.get(f"{API}/meetings/{meeting['meeting_number']}/lookup")
    assert response.status_code == 200, response.text


def test_lookup_returns_exactly_the_public_shape(
    api: TestClient, meeting: dict
) -> None:
    body = api.get(f"{API}/meetings/{meeting['meeting_number']}/lookup").json()
    assert set(body) == {"meeting_number", "topic", "status", "passcode_required"}
    assert body["topic"] == "API Test Meeting"
    assert body["passcode_required"] is True


def test_lookup_leaks_no_private_fields(api: TestClient, meeting: dict) -> None:
    """§11's named requirement. Asserted two ways: no private key is present,
    and no private *value* appears anywhere in the serialized body — the second
    catches a leak that renamed the key."""
    response = api.get(f"{API}/meetings/{meeting['meeting_number']}/lookup")
    body = response.json()

    leaked_keys = PRIVATE_FIELDS & set(body)
    assert not leaked_keys, f"/lookup leaked private keys: {sorted(leaked_keys)}"

    raw = response.text
    for secret in (meeting["passcode"], meeting["invite_token"], meeting["id"]):
        assert secret not in raw, f"/lookup leaked the value {secret!r}"


def test_lookup_on_an_unknown_number_is_404(api: TestClient) -> None:
    response = api.get(f"{API}/meetings/99999999999/lookup")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "MEETING_NOT_FOUND"


def test_lookup_hides_a_cancelled_meeting(
    api: TestClient, host: User
) -> None:
    """A cancelled meeting is indistinguishable from a nonexistent one — there
    is nothing left to join and the topic is no longer public."""
    created = api.post(
        f"{API}/meetings",
        json={
            "topic": "Cancelled",
            "scheduled_start": (utcnow() + timedelta(days=1)).isoformat(),
        },
        headers=auth(host),
    ).json()
    api.delete(f"{API}/meetings/{created['meeting_number']}", headers=auth(host))

    response = api.get(f"{API}/meetings/{created['meeting_number']}/lookup")
    assert response.status_code == 404


# --- Auth and guest gating (§8) ----------------------------------------------


def test_guest_auth_returns_a_short_lived_token(api: TestClient) -> None:
    response = api.post(f"{API}/auth/guest", json={"display_name": "Anon Visitor"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 4 * 3600  # §8: 4h
    assert body["user"]["is_guest"] is True
    assert body["user"]["name"] == "Anon Visitor"


def test_guest_email_is_synthetic_and_has_no_google_id(api: TestClient) -> None:
    body = api.post(f"{API}/auth/guest", json={"display_name": "Anon"}).json()
    assert body["user"]["email"].endswith("@guest.zoomclone.local")
    assert "google_id" not in body["user"]


def test_two_guests_with_the_same_name_do_not_collide(api: TestClient) -> None:
    """The unique email index would reject a name-derived address."""
    a = api.post(f"{API}/auth/guest", json={"display_name": "Alex"})
    b = api.post(f"{API}/auth/guest", json={"display_name": "Alex"})
    assert a.status_code == b.status_code == 200
    assert a.json()["user"]["id"] != b.json()["user"]["id"]


def test_guests_cannot_list_meetings(api: TestClient) -> None:
    """§8 — guests cannot list, schedule, or hold host tools."""
    token = api.post(f"{API}/auth/guest", json={"display_name": "G"}).json()[
        "access_token"
    ]
    response = api.get(
        f"{API}/meetings", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "GUEST_FORBIDDEN"


def test_guests_cannot_schedule_meetings(api: TestClient) -> None:
    token = api.post(f"{API}/auth/guest", json={"display_name": "G"}).json()[
        "access_token"
    ]
    response = api.post(
        f"{API}/meetings",
        json={"topic": "Nope"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


def test_a_guest_can_still_join(api: TestClient, meeting: dict) -> None:
    """The core flow must work without a login (§8)."""
    token = api.post(f"{API}/auth/guest", json={"display_name": "Visitor"}).json()[
        "access_token"
    ]
    response = api.post(
        f"{API}/meetings/{meeting['meeting_number']}/join",
        json={"passcode": meeting["passcode"], "display_name": "Visitor"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["participant"]["display_name"] == "Visitor"


def test_an_empty_display_name_is_rejected(api: TestClient) -> None:
    assert api.post(f"{API}/auth/guest", json={"display_name": "   "}).status_code == 422


def test_protected_routes_require_a_token(api: TestClient) -> None:
    assert api.get(f"{API}/users/me").status_code == 401
    assert api.get(f"{API}/meetings").status_code == 401


def test_a_garbage_token_is_rejected(api: TestClient) -> None:
    response = api.get(
        f"{API}/users/me", headers={"Authorization": "Bearer not-a-jwt"}
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_TOKEN"


def test_google_auth_is_501_without_a_configured_client_id(api: TestClient) -> None:
    """Verification is real; it simply cannot run without an expected audience."""
    response = api.post(f"{API}/auth/google", json={"id_token": "x.y.z"})
    assert response.status_code == 501
    assert response.json()["error"]["code"] == "GOOGLE_AUTH_UNCONFIGURED"


# --- Join over HTTP ----------------------------------------------------------


def test_join_returns_session_id_and_ice_servers(
    api: TestClient, meeting: dict, joiner: User
) -> None:
    response = api.post(
        f"{API}/meetings/{meeting['meeting_number']}/join",
        json={"passcode": meeting["passcode"]},
        headers=auth(joiner),
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["session_id"]
    assert body["max_participants"] == 6
    assert len(body["ice_servers"]) == 2


def test_join_with_a_bad_passcode_is_403(
    api: TestClient, meeting: dict, joiner: User
) -> None:
    response = api.post(
        f"{API}/meetings/{meeting['meeting_number']}/join",
        json={"passcode": "nope"},
        headers=auth(joiner),
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "INVALID_PASSCODE"


def test_join_accepts_the_spaced_display_form(
    api: TestClient, meeting: dict, joiner: User
) -> None:
    """§6.4 strips spaces client-side; the server tolerates them regardless."""
    spaced = meeting["meeting_number_display"]
    response = api.post(
        f"{API}/meetings/{spaced}/join",
        json={"passcode": meeting["passcode"]},
        headers=auth(joiner),
    )
    assert response.status_code == 200, response.text


# --- Create / list / transitions --------------------------------------------


def test_an_instant_meeting_is_born_live(api: TestClient, meeting: dict) -> None:
    assert meeting["status"] == "live"
    assert meeting["is_instant"] is True
    assert meeting["scheduled_start"] is None


def test_a_scheduled_meeting_starts_as_scheduled(
    api: TestClient, host: User
) -> None:
    response = api.post(
        f"{API}/meetings",
        json={
            "topic": "Later",
            "scheduled_start": (utcnow() + timedelta(hours=5)).isoformat(),
            "duration_minutes": 30,
        },
        headers=auth(host),
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "scheduled"
    assert body["is_instant"] is False


def test_a_past_start_time_is_rejected(api: TestClient, host: User) -> None:
    response = api.post(
        f"{API}/meetings",
        json={
            "topic": "Yesterday",
            "scheduled_start": (utcnow() - timedelta(days=1)).isoformat(),
        },
        headers=auth(host),
    )
    assert response.status_code == 422


def test_a_basic_plan_clamps_the_duration_to_forty_minutes(
    api: TestClient, session: Session
) -> None:
    """§6.6 — clamp and surface it, rather than silently shortening."""
    from tests.conftest import make_user

    basic = make_user(session, name="Basic User", plan="basic")
    response = api.post(
        f"{API}/meetings",
        json={
            "topic": "Long one",
            "scheduled_start": (utcnow() + timedelta(hours=2)).isoformat(),
            "duration_minutes": 120,
        },
        headers=auth(basic),
    )
    body = response.json()
    assert body["duration_minutes"] == 40
    assert body["duration_clamped"] is True


def test_a_pro_plan_keeps_a_long_duration(api: TestClient, host: User) -> None:
    body = api.post(
        f"{API}/meetings",
        json={
            "topic": "Workshop",
            "scheduled_start": (utcnow() + timedelta(hours=2)).isoformat(),
            "duration_minutes": 120,
        },
        headers=auth(host),
    ).json()
    assert body["duration_minutes"] == 120
    assert body["duration_clamped"] is False


def test_filter_upcoming_lists_only_future_scheduled_meetings(
    api: TestClient, host: User, meeting: dict
) -> None:
    api.post(
        f"{API}/meetings",
        json={
            "topic": "Tomorrow",
            "scheduled_start": (utcnow() + timedelta(days=1)).isoformat(),
        },
        headers=auth(host),
    )
    body = api.get(f"{API}/meetings?filter=upcoming", headers=auth(host)).json()
    topics = [m["topic"] for m in body["items"]]
    assert topics == ["Tomorrow"]
    # The instant meeting has no scheduled_start, so it is not "upcoming".
    assert "API Test Meeting" not in topics


def test_filter_recent_lists_ended_meetings(
    api: TestClient, host: User, meeting: dict
) -> None:
    api.post(f"{API}/meetings/{meeting['meeting_number']}/end", headers=auth(host))
    body = api.get(f"{API}/meetings?filter=recent", headers=auth(host)).json()
    assert [m["topic"] for m in body["items"]] == ["API Test Meeting"]


def test_filter_all_lists_everything(
    api: TestClient, host: User, meeting: dict
) -> None:
    api.post(
        f"{API}/meetings",
        json={
            "topic": "Second",
            "scheduled_start": (utcnow() + timedelta(days=2)).isoformat(),
        },
        headers=auth(host),
    )
    body = api.get(f"{API}/meetings?filter=all", headers=auth(host)).json()
    assert len(body["items"]) == 2


def test_filter_day_returns_that_days_meetings(
    api: TestClient, host: User
) -> None:
    """§6.2 — the Home day strip's query."""
    target = utcnow() + timedelta(days=3)
    api.post(
        f"{API}/meetings",
        json={"topic": "On the day", "scheduled_start": target.isoformat()},
        headers=auth(host),
    )
    api.post(
        f"{API}/meetings",
        json={
            "topic": "Different day",
            "scheduled_start": (target + timedelta(days=1)).isoformat(),
        },
        headers=auth(host),
    )
    body = api.get(
        f"{API}/meetings?filter=day&date={target.date().isoformat()}",
        headers=auth(host),
    ).json()
    assert [m["topic"] for m in body["items"]] == ["On the day"]


def test_filter_day_requires_a_date(api: TestClient, host: User) -> None:
    response = api.get(f"{API}/meetings?filter=day", headers=auth(host))
    assert response.status_code == 422
    assert response.json()["error"]["details"]["field"] == "date"


def test_filter_day_rejects_a_malformed_date(api: TestClient, host: User) -> None:
    response = api.get(
        f"{API}/meetings?filter=day&date=13-08-2026", headers=auth(host)
    )
    assert response.status_code == 422


def test_an_unknown_filter_is_rejected(api: TestClient, host: User) -> None:
    assert api.get(f"{API}/meetings?filter=bogus", headers=auth(host)).status_code == 422


def test_pagination_walks_the_full_set(api: TestClient, host: User) -> None:
    for i in range(5):
        api.post(
            f"{API}/meetings",
            json={
                "topic": f"M{i}",
                "scheduled_start": (utcnow() + timedelta(days=i + 1)).isoformat(),
            },
            headers=auth(host),
        )

    seen: list[str] = []
    cursor = None
    for _ in range(10):
        url = f"{API}/meetings?filter=upcoming&limit=2"
        if cursor:
            url += f"&cursor={cursor}"
        body = api.get(url, headers=auth(host)).json()
        seen.extend(m["topic"] for m in body["items"])
        cursor = body["next_cursor"]
        if not cursor:
            break

    assert seen == ["M0", "M1", "M2", "M3", "M4"], "pagination skipped or repeated rows"


def test_a_host_only_sees_their_own_meetings(
    api: TestClient, host: User, joiner: User, meeting: dict
) -> None:
    body = api.get(f"{API}/meetings?filter=all", headers=auth(joiner)).json()
    assert body["items"] == []


def test_start_and_end_over_http(api: TestClient, host: User) -> None:
    created = api.post(
        f"{API}/meetings",
        json={
            "topic": "Transitions",
            "scheduled_start": (utcnow() + timedelta(hours=1)).isoformat(),
        },
        headers=auth(host),
    ).json()
    number = created["meeting_number"]

    started = api.post(f"{API}/meetings/{number}/start", headers=auth(host))
    assert started.status_code == 200
    assert started.json()["status"] == "live"

    ended = api.post(f"{API}/meetings/{number}/end", headers=auth(host))
    assert ended.status_code == 200
    assert ended.json()["status"] == "ended"


def test_an_illegal_transition_returns_409(
    api: TestClient, meeting: dict, host: User
) -> None:
    """§5.4 — `InvalidStateTransition` maps to HTTP 409."""
    response = api.post(
        f"{API}/meetings/{meeting['meeting_number']}/start", headers=auth(host)
    )
    assert response.status_code == 409
    body = response.json()
    assert body["error"]["code"] == "INVALID_STATE_TRANSITION"
    assert body["error"]["details"]["from"] == "live"


def test_ending_a_scheduled_meeting_returns_409(api: TestClient, host: User) -> None:
    created = api.post(
        f"{API}/meetings",
        json={
            "topic": "Not started",
            "scheduled_start": (utcnow() + timedelta(hours=1)).isoformat(),
        },
        headers=auth(host),
    ).json()
    response = api.post(
        f"{API}/meetings/{created['meeting_number']}/end", headers=auth(host)
    )
    assert response.status_code == 409


def test_a_non_host_cannot_end_a_meeting(
    api: TestClient, meeting: dict, joiner: User
) -> None:
    response = api.post(
        f"{API}/meetings/{meeting['meeting_number']}/end", headers=auth(joiner)
    )
    assert response.status_code == 403


def test_edit_and_cancel(api: TestClient, host: User) -> None:
    created = api.post(
        f"{API}/meetings",
        json={
            "topic": "Original",
            "scheduled_start": (utcnow() + timedelta(days=1)).isoformat(),
        },
        headers=auth(host),
    ).json()
    number = created["meeting_number"]

    edited = api.patch(
        f"{API}/meetings/{number}", json={"topic": "Renamed"}, headers=auth(host)
    )
    assert edited.status_code == 200
    assert edited.json()["topic"] == "Renamed"

    cancelled = api.delete(f"{API}/meetings/{number}", headers=auth(host))
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"


def test_a_live_meeting_cannot_be_edited(
    api: TestClient, meeting: dict, host: User
) -> None:
    """Retconning a meeting that already ran would corrupt the Previous tab."""
    response = api.patch(
        f"{API}/meetings/{meeting['meeting_number']}",
        json={"topic": "Rewritten"},
        headers=auth(host),
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "MEETING_NOT_EDITABLE"


# --- Detail authorization ----------------------------------------------------


def test_the_host_reads_the_full_detail(
    api: TestClient, meeting: dict, host: User
) -> None:
    body = api.get(
        f"{API}/meetings/{meeting['meeting_number']}", headers=auth(host)
    ).json()
    assert body["passcode"] == meeting["passcode"]
    assert body["invite_token"] == meeting["invite_token"]


def test_a_stranger_cannot_read_the_detail(
    api: TestClient, meeting: dict, joiner: User
) -> None:
    """Otherwise the passcode could be read straight out of the detail call."""
    response = api.get(
        f"{API}/meetings/{meeting['meeting_number']}", headers=auth(joiner)
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "NOT_A_PARTICIPANT"


def test_a_participant_can_read_the_detail_after_joining(
    api: TestClient, meeting: dict, joiner: User
) -> None:
    api.post(
        f"{API}/meetings/{meeting['meeting_number']}/join",
        json={"passcode": meeting["passcode"]},
        headers=auth(joiner),
    )
    response = api.get(
        f"{API}/meetings/{meeting['meeting_number']}", headers=auth(joiner)
    )
    assert response.status_code == 200


# --- Users and preferences ---------------------------------------------------


def test_users_me_returns_plan_and_pmi(api: TestClient, host: User) -> None:
    body = api.get(f"{API}/users/me", headers=auth(host)).json()
    assert body["name"] == "Pinak Kundu"
    assert body["plan"] == "pro"
    assert len(body["personal_meeting_id"]) == 11
    assert body["personal_meeting_id_display"].count(" ") == 2


def test_users_me_never_exposes_the_google_id(api: TestClient, host: User) -> None:
    assert "google_id" not in api.get(f"{API}/users/me", headers=auth(host)).json()


def test_patch_users_me_updates_the_name(api: TestClient, host: User) -> None:
    body = api.patch(
        f"{API}/users/me", json={"name": "Pinak K."}, headers=auth(host)
    ).json()
    assert body["name"] == "Pinak K."


def test_preferences_serve_defaults_before_any_save(
    api: TestClient, host: User
) -> None:
    """§3.2 — defaults when no row exists, and a GET must not write one."""
    body = api.get(f"{API}/users/me/preferences", headers=auth(host)).json()
    assert body["theme"] == "classic"
    assert body["mute_on_join"] is False
    assert body["gallery_size"] == 9


def test_preferences_upsert_then_read_back(api: TestClient, host: User) -> None:
    written = api.put(
        f"{API}/users/me/preferences",
        json={"theme": "bloom", "mute_on_join": True, "gallery_size": 25},
        headers=auth(host),
    )
    assert written.status_code == 200, written.text
    body = api.get(f"{API}/users/me/preferences", headers=auth(host)).json()
    assert body["theme"] == "bloom"
    assert body["mute_on_join"] is True
    assert body["gallery_size"] == 25


def test_preferences_reject_an_unknown_theme(api: TestClient, host: User) -> None:
    response = api.put(
        f"{API}/users/me/preferences", json={"theme": "neon"}, headers=auth(host)
    )
    assert response.status_code == 422


def test_preferences_reject_an_unsupported_gallery_size(
    api: TestClient, host: User
) -> None:
    response = api.put(
        f"{API}/users/me/preferences", json={"gallery_size": 12}, headers=auth(host)
    )
    assert response.status_code == 422


# --- Chat --------------------------------------------------------------------


def test_chat_history_is_participant_scoped(
    api: TestClient, session: Session, meeting: dict, host: User, joiner: User
) -> None:
    """No REST route posts chat — messages arrive over the WS `chat.send` frame
    (§5.2, P9). The service is exercised directly here so the persistence and
    the read path are both covered before that lands."""
    from app.services import chat_service

    joined = api.post(
        f"{API}/meetings/{meeting['meeting_number']}/join",
        json={"passcode": meeting["passcode"]},
        headers=auth(joiner),
    ).json()

    chat_service.post_message(
        session, meeting["id"], joined["participant"]["id"], "hello from the drawer"
    )

    body = api.get(
        f"{API}/meetings/{meeting['meeting_number']}/messages", headers=auth(joiner)
    ).json()
    assert [m["body"] for m in body] == ["hello from the drawer"]
    assert body[0]["display_name"] == joiner.name


def test_a_stranger_cannot_read_chat_history(
    api: TestClient, meeting: dict, joiner: User
) -> None:
    response = api.get(
        f"{API}/meetings/{meeting['meeting_number']}/messages", headers=auth(joiner)
    )
    assert response.status_code == 403


# --- Error envelope ----------------------------------------------------------


def test_every_error_uses_the_section_four_envelope(api: TestClient) -> None:
    body = api.get(f"{API}/meetings/99999999999/lookup").json()
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message", "details"}
