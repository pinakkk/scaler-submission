"""Shared column helpers for the table modules (§3.1).

Primary keys are string UUID4s rather than integers: meeting/participant ids
appear in URLs and WebSocket frames, and sequential integers there would leak
volume and be trivially enumerable — the same reasoning §3.3 applies to meeting
numbers.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime


def new_id() -> str:
    """Fresh UUID4 primary key."""
    return str(uuid.uuid4())


def utcnow() -> datetime:
    """Naive UTC timestamp.

    SQLite has no native tz-aware type; storing naive UTC everywhere keeps
    comparisons (`scheduled_start > now`) sane and avoids the mixed
    aware/naive ordering errors that a partially-aware schema invites.
    """
    return datetime.now(UTC).replace(tzinfo=None)
