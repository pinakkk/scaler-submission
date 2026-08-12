"""Redis-backed cache — explicitly phase 2 (§9).

The seam exists so `get_cache()` can select it once `REDIS_URL` is set; the
implementation lands with the phase-2 work. Every method raises rather than
silently degrading, so a half-wired Redis config fails loudly.
"""

from __future__ import annotations


class RedisCache:
    def __init__(self, url: str) -> None:
        self._url = url
        raise NotImplementedError(
            "RedisCache is phase 2. Unset REDIS_URL to use MemoryCache."
        )

    async def get(self, key: str) -> str | None:  # pragma: no cover - phase 2
        raise NotImplementedError

    async def set(
        self, key: str, value: str, ttl: int | None = None
    ) -> None:  # pragma: no cover - phase 2
        raise NotImplementedError

    async def delete(self, key: str) -> None:  # pragma: no cover - phase 2
        raise NotImplementedError

    async def incr(self, key: str) -> int:  # pragma: no cover - phase 2
        raise NotImplementedError
