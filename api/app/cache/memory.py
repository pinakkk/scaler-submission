"""In-process cache: dict + TTL sweep. The default backend (§9)."""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass


@dataclass(slots=True)
class _Entry:
    value: str
    expires_at: float | None  # monotonic deadline; None == never expires

    def is_expired(self, now: float) -> bool:
        return self.expires_at is not None and now >= self.expires_at


class MemoryCache:
    """Single-process cache with lazy expiry plus an opportunistic sweep.

    Correctness comes from the lazy check on read; the sweep only stops keys
    that are never read again from accumulating. A lock keeps `incr`
    read-modify-write atomic across concurrent tasks.
    """

    def __init__(self, sweep_interval: float = 60.0) -> None:
        self._data: dict[str, _Entry] = {}
        self._lock = asyncio.Lock()
        self._sweep_interval = sweep_interval
        self._last_sweep = time.monotonic()

    async def get(self, key: str) -> str | None:
        async with self._lock:
            self._maybe_sweep()
            entry = self._data.get(key)
            if entry is None:
                return None
            if entry.is_expired(time.monotonic()):
                del self._data[key]
                return None
            return entry.value

    async def set(self, key: str, value: str, ttl: int | None = None) -> None:
        async with self._lock:
            self._maybe_sweep()
            expires_at = time.monotonic() + ttl if ttl is not None else None
            self._data[key] = _Entry(value=value, expires_at=expires_at)

    async def delete(self, key: str) -> None:
        async with self._lock:
            self._data.pop(key, None)

    async def incr(self, key: str) -> int:
        async with self._lock:
            now = time.monotonic()
            entry = self._data.get(key)
            if entry is None or entry.is_expired(now):
                current = 0
                expires_at = None
            else:
                try:
                    current = int(entry.value)
                except ValueError:
                    current = 0
                expires_at = entry.expires_at  # incr preserves the existing TTL
            new_value = current + 1
            self._data[key] = _Entry(value=str(new_value), expires_at=expires_at)
            return new_value

    async def clear(self) -> None:
        async with self._lock:
            self._data.clear()

    def _maybe_sweep(self) -> None:
        """Drop expired keys at most once per `sweep_interval`. Caller holds the lock."""
        now = time.monotonic()
        if now - self._last_sweep < self._sweep_interval:
            return
        self._last_sweep = now
        expired = [k for k, e in self._data.items() if e.is_expired(now)]
        for key in expired:
            del self._data[key]
