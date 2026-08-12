"""Cache package — protocol, implementations, and the selection factory (§9)."""

from __future__ import annotations

from functools import lru_cache

from app.cache.base import CacheBackend
from app.cache.memory import MemoryCache
from app.cache.redis import RedisCache
from app.config import settings

__all__ = ["CacheBackend", "MemoryCache", "RedisCache", "get_cache"]


@lru_cache
def get_cache() -> CacheBackend:
    """Return the process-wide cache backend.

    MemoryCache by default; RedisCache when REDIS_URL is configured (phase 2).
    """
    if settings.REDIS_URL:
        return RedisCache(settings.REDIS_URL)
    return MemoryCache()
