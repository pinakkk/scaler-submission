"""Engine, session dependency, and SQLite PRAGMA wiring (§3.2).

The pragmas are applied per-connection via a SQLAlchemy `connect` event. This
matters: SQLAlchemy pools connections, so setting them once at startup would
only configure the first connection. `foreign_keys` in particular is per
connection and OFF by default — miss this and FK constraints silently never fire.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Generator, Iterator
from contextlib import contextmanager
from typing import Any

from sqlalchemy import event, text
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine

__all__ = [
    "SQLITE_PRAGMAS",
    "check_database",
    "engine",
    "get_session",
    "init_db",
    "session_scope",
    "verify_pragmas",
]

from app.config import settings

# §3.2 — set on every connection.
SQLITE_PRAGMAS: dict[str, str | int] = {
    "journal_mode": "WAL",
    "foreign_keys": "ON",
    "busy_timeout": 5000,
    "synchronous": "NORMAL",
}

_is_sqlite = settings.DATABASE_URL.startswith("sqlite")

engine: Engine = create_engine(
    settings.DATABASE_URL,
    echo=False,
    # SQLite's default same-thread guard trips under FastAPI's threadpool.
    connect_args={"check_same_thread": False} if _is_sqlite else {},
)


def _set_sqlite_pragmas(dbapi_connection: Any, connection_record: Any) -> None:
    """Apply the §3.2 pragmas to each new SQLite connection."""
    if not isinstance(dbapi_connection, sqlite3.Connection):
        return  # non-SQLite backend; nothing to do
    cursor = dbapi_connection.cursor()
    try:
        for pragma, value in SQLITE_PRAGMAS.items():
            cursor.execute(f"PRAGMA {pragma}={value}")
    finally:
        cursor.close()


# Bound to this engine, not to the Engine class: a class-level listener would
# silently reconfigure every other engine created in the process (including
# test fixtures), which makes pragma behaviour impossible to reason about.
event.listen(engine, "connect", _set_sqlite_pragmas)


def verify_pragmas() -> dict[str, Any]:
    """Read the pragmas back from a live connection.

    Applying a pragma can silently no-op (WAL is refused on some filesystems,
    e.g. certain network mounts), so we query rather than assume. Returns the
    observed values keyed by pragma name.
    """
    if not _is_sqlite:
        return {}
    observed: dict[str, Any] = {}
    with engine.connect() as conn:
        for pragma in SQLITE_PRAGMAS:
            row = conn.exec_driver_sql(f"PRAGMA {pragma}").fetchone()
            observed[pragma] = row[0] if row else None
    return observed


def init_db() -> None:
    """Create tables for every registered SQLModel.

    No models exist yet (P2 adds them). Importing `app.models` here is what
    registers them on `SQLModel.metadata`, so this becomes a real create_all
    the moment P2 lands, with no change required to this function.
    """
    import app.models  # noqa: F401  (import for side effect: table registration)

    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a session per request."""
    with Session(engine) as session:
        yield session


@contextmanager
def session_scope() -> Iterator[Session]:
    """Session for non-request contexts (seed scripts, background tasks)."""
    with Session(engine) as session:
        yield session


def check_database() -> bool:
    """Cheap liveness probe for /health — a single `SELECT 1` round-trip (§12.3)."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
