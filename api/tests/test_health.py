"""P1 acceptance: the app boots and /health is green (§10)."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_health_returns_ok(client: TestClient) -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200

    body = response.json()
    assert body["status"] == "ok"
    assert body["db"] == "ok"
    assert isinstance(body["uptime_s"], (int, float))
    assert body["uptime_s"] >= 0


def test_health_shape_matches_spec(client: TestClient) -> None:
    """§4 pins the response to exactly {status, db, uptime_s}."""
    body = client.get("/api/v1/health").json()
    assert set(body) == {"status", "db", "uptime_s"}


def test_health_db_reflects_a_real_round_trip(client: TestClient) -> None:
    """`db` must come from an actual SELECT 1, not a hardcoded literal."""
    from app.routers import health as health_module

    original = health_module.check_database
    health_module.check_database = lambda: False
    try:
        body = client.get("/api/v1/health").json()
        assert body["db"] == "error"
        assert body["status"] == "degraded"
    finally:
        health_module.check_database = original

    assert client.get("/api/v1/health").json()["db"] == "ok"


def test_uptime_is_monotonic(client: TestClient) -> None:
    first = client.get("/api/v1/health").json()["uptime_s"]
    second = client.get("/api/v1/health").json()["uptime_s"]
    assert second >= first


def test_unknown_route_uses_error_envelope(client: TestClient) -> None:
    """The frontend codes against one error shape (§4)."""
    response = client.get("/api/v1/does-not-exist")
    assert response.status_code == 404

    body = response.json()
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message", "details"}
    assert body["error"]["code"] == "NOT_FOUND"


def test_cors_preflight_allows_frontend_origin(client: TestClient) -> None:
    response = client.options(
        "/api/v1/health",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
