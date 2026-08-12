"""Shared fixtures. Tests run against a temp-file SQLite DB, never ./zoom.db."""

from __future__ import annotations

import os
import tempfile
from collections.abc import Iterator
from pathlib import Path

# Point the app at a throwaway database *before* app modules import settings.
# WAL needs a real file on disk, so a temp file — not :memory: — is required
# for the pragma assertions to be meaningful.
_tmpdir = tempfile.mkdtemp(prefix="zoom-api-tests-")
_db_path = Path(_tmpdir) / "test.db"
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_db_path}")
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import Session, SQLModel, delete  # noqa: E402

from app.database import engine, init_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    ChatMessage,
    Meeting,
    MeetingInvitee,
    Participant,
    User,
    UserPreferences,
)
from app.services.security import generate_meeting_number  # noqa: E402


@pytest.fixture(scope="session")
def client() -> Iterator[TestClient]:
    """TestClient as a context manager so lifespan (init_db) actually runs."""
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session", autouse=True)
def _create_schema() -> None:
    """Ensure tables exist even for tests that never touch the TestClient."""
    SQLModel.metadata.create_all(engine)
    init_db()


@pytest.fixture
def session() -> Iterator[Session]:
    """A clean database per test.

    Truncating between tests rather than sharing state keeps row-count
    assertions (seed idempotency, participant lifecycle) meaningful — those
    tests are worthless if a previous test's rows are still present. Children
    first: `foreign_keys=ON` is live, so the delete order is load-bearing.
    """
    with Session(engine) as s:
        _truncate(s)
        yield s
        _truncate(s)


def _truncate(s: Session) -> None:
    for model in (
        ChatMessage,
        Participant,
        MeetingInvitee,
        Meeting,
        UserPreferences,
        User,
    ):
        s.exec(delete(model))
    s.commit()


def make_user(
    session: Session,
    *,
    name: str = "Test Host",
    email: str | None = None,
    plan: str = "basic",
    is_guest: bool = False,
) -> User:
    import secrets

    user = User(
        email=email or f"{secrets.token_hex(6)}@example.com",
        name=name,
        personal_meeting_id=generate_meeting_number(),
        plan=plan,
        is_guest=is_guest,
        google_id=None if is_guest else f"g-{secrets.token_hex(6)}",
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@pytest.fixture(autouse=True)
def _reset_rate_limits() -> None:
    """Clear the slowapi counters between tests.

    The limiter is a process-wide in-memory store (§4), so without this a
    module that creates 30 meetings across several tests would start returning
    429 to whichever test happens to run last. The limits themselves are
    exercised deliberately in `test_rate_limits.py`.
    """
    from app.rate_limit import limiter

    limiter.reset()


@pytest.fixture
def host(session: Session) -> User:
    return make_user(session, name="Pinak Kundu", plan="pro")


@pytest.fixture
def joiner(session: Session) -> User:
    return make_user(session, name="Arjun Mehta")
