"""Schema shape: tables, the six §3.2 indexes, and FK enforcement (§3.1, §3.2)."""

from __future__ import annotations

import pytest
from sqlmodel import Session

from app.database import engine

# §3.2 verbatim. SQLite will not infer these, so their absence is silent —
# queries stay correct and merely get slow, which no functional test would catch.
REQUIRED_INDEXES = {
    "ix_meetings_number": ("meetings", True),
    "ix_meetings_invite": ("meetings", True),
    "ix_meetings_host_start": ("meetings", False),
    "ix_meetings_host_status": ("meetings", False),
    "ix_participants_active": ("participants", False),
    "ix_chat_meeting_time": ("chat_messages", False),
}

REQUIRED_TABLES = {
    "users",
    "meetings",
    "participants",
    "chat_messages",
    "meeting_invitees",
    "user_preferences",
}


def _tables() -> set[str]:
    with engine.connect() as conn:
        return {
            row[0]
            for row in conn.exec_driver_sql(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )
        }


def _indexes() -> dict[str, str]:
    with engine.connect() as conn:
        return {
            row[0]: row[1]
            for row in conn.exec_driver_sql(
                "SELECT name, tbl_name FROM sqlite_master WHERE type='index'"
            )
        }


def test_every_table_from_the_er_diagram_exists() -> None:
    assert _tables() >= REQUIRED_TABLES


@pytest.mark.parametrize("index_name", sorted(REQUIRED_INDEXES))
def test_the_six_spec_indexes_exist(index_name: str) -> None:
    indexes = _indexes()
    assert index_name in indexes, f"missing index {index_name}"
    assert indexes[index_name] == REQUIRED_INDEXES[index_name][0]


@pytest.mark.parametrize(
    "index_name",
    sorted(n for n, (_, unique) in REQUIRED_INDEXES.items() if unique),
)
def test_the_unique_indexes_are_actually_unique(index_name: str) -> None:
    """A non-unique `ix_meetings_number` would make the §3.3 retry logic
    pointless — collisions would simply persist."""
    with engine.connect() as conn:
        table = REQUIRED_INDEXES[index_name][0]
        rows = conn.exec_driver_sql(f"PRAGMA index_list('{table}')").fetchall()
        entry = next(r for r in rows if r[1] == index_name)
        assert entry[2] == 1, f"{index_name} is not UNIQUE"


def test_the_participants_index_covers_the_active_predicate() -> None:
    """`left_at IS NULL` drives every participant count (§3.2), so the index
    must include that column, not just meeting_id."""
    with engine.connect() as conn:
        cols = [
            r[2]
            for r in conn.exec_driver_sql(
                "PRAGMA index_info('ix_participants_active')"
            ).fetchall()
        ]
    assert cols == ["meeting_id", "left_at"]


def test_user_preferences_is_keyed_one_row_per_user(session: Session) -> None:
    """`user_id` is PK and FK — one row per user, enforced by the schema."""
    with engine.connect() as conn:
        pk_cols = [
            r[1]
            for r in conn.exec_driver_sql(
                "PRAGMA table_info('user_preferences')"
            ).fetchall()
            if r[5]  # pk flag
        ]
    assert pk_cols == ["user_id"]


def test_foreign_keys_are_declared_on_every_child_table() -> None:
    expected = {
        "meetings": {"users"},
        "participants": {"meetings", "users"},
        "chat_messages": {"meetings", "participants"},
        "meeting_invitees": {"meetings"},
        "user_preferences": {"users"},
    }
    with engine.connect() as conn:
        for table, parents in expected.items():
            rows = conn.exec_driver_sql(f"PRAGMA foreign_key_list('{table}')").fetchall()
            assert {r[2] for r in rows} == parents, f"{table} FKs are wrong"
