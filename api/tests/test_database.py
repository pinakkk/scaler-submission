"""The §3.2 pragmas must be live on every pooled connection."""

from __future__ import annotations

from sqlmodel import Session

from app.database import SQLITE_PRAGMAS, engine, verify_pragmas


def test_pragmas_are_applied() -> None:
    observed = verify_pragmas()

    # SQLite reports these in its own vocabulary, not the literal input values.
    assert str(observed["journal_mode"]).lower() == "wal"
    assert observed["foreign_keys"] == 1  # ON
    assert observed["busy_timeout"] == 5000
    assert observed["synchronous"] == 1  # NORMAL


def test_pragmas_apply_to_every_new_connection() -> None:
    """Pooled connections are the trap: setting pragmas once at startup only
    configures the first connection. Check a second, independent one."""
    for _ in range(3):
        with Session(engine) as session:
            conn = session.connection()
            assert conn.exec_driver_sql("PRAGMA foreign_keys").fetchone()[0] == 1
            assert conn.exec_driver_sql("PRAGMA busy_timeout").fetchone()[0] == 5000


def test_foreign_keys_are_actually_enforced() -> None:
    """Read-back is necessary but not sufficient — prove the constraint fires."""
    import sqlite3

    with engine.connect() as conn:
        conn.exec_driver_sql("CREATE TEMP TABLE _p (id INTEGER PRIMARY KEY)")
        conn.exec_driver_sql(
            "CREATE TEMP TABLE _c (id INTEGER PRIMARY KEY, "
            "p_id INTEGER REFERENCES _p(id))"
        )
        try:
            conn.exec_driver_sql("INSERT INTO _c (id, p_id) VALUES (1, 999)")
        except Exception as exc:
            assert isinstance(exc.__cause__ or exc, sqlite3.IntegrityError) or (
                "FOREIGN KEY" in str(exc).upper()
            )
        else:
            raise AssertionError("foreign_keys=ON did not reject an orphan row")


def test_all_spec_pragmas_are_declared() -> None:
    assert set(SQLITE_PRAGMAS) == {
        "journal_mode",
        "foreign_keys",
        "busy_timeout",
        "synchronous",
    }


def test_init_db_is_idempotent() -> None:
    """No models exist yet (P2 adds them); this must still be a working no-op."""
    from app.database import init_db

    init_db()
    init_db()
