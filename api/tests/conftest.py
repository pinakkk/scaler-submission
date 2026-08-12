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

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client() -> Iterator[TestClient]:
    """TestClient as a context manager so lifespan (init_db) actually runs."""
    with TestClient(app) as c:
        yield c
