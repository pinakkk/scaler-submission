"""Liveness endpoint (§4).

Hit 288x/day by the keep-alive cron, so it stays cheap: one SELECT 1 and an
uptime counter, nothing more (§12.3).
"""

from __future__ import annotations

import time

from fastapi import APIRouter

from app.database import check_database
from app.schemas.health import HealthResponse

router = APIRouter(tags=["health"])

# Captured at import time — as close to process start as this module can observe.
PROCESS_START = time.monotonic()


def uptime_seconds() -> float:
    return round(time.monotonic() - PROCESS_START, 3)


@router.get("/health", response_model=HealthResponse, summary="Liveness probe")
def health() -> HealthResponse:
    """Report process and database liveness.

    `db` reflects a real `SELECT 1` round-trip, not a cached flag. Status stays
    "ok" only while the database answers; otherwise "degraded" — the process is
    up but cannot serve requests, and the cron log should show that difference.
    """
    db_ok = check_database()
    return HealthResponse(
        status="ok" if db_ok else "degraded",
        db="ok" if db_ok else "error",
        uptime_s=uptime_seconds(),
    )
