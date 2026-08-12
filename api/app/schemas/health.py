"""Response schema for /health (§4)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = Field(description='"ok" when the service is fully serving.')
    db: str = Field(description='"ok" when a SELECT 1 round-trip succeeds.')
    uptime_s: float = Field(description="Seconds since process start.")
