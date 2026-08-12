"""MemoryCache behaviour and the backend-selection seam (§9)."""

from __future__ import annotations

import pytest

from app.cache import CacheBackend, MemoryCache


async def test_set_and_get() -> None:
    cache = MemoryCache()
    await cache.set("k", "v")
    assert await cache.get("k") == "v"


async def test_missing_key_returns_none() -> None:
    assert await MemoryCache().get("nope") is None


async def test_ttl_expires(monkeypatch: pytest.MonkeyPatch) -> None:
    cache = MemoryCache()
    now = 1000.0
    monkeypatch.setattr("app.cache.memory.time.monotonic", lambda: now)
    await cache.set("k", "v", ttl=60)
    assert await cache.get("k") == "v"

    now = 1061.0
    assert await cache.get("k") is None


async def test_delete() -> None:
    cache = MemoryCache()
    await cache.set("k", "v")
    await cache.delete("k")
    assert await cache.get("k") is None
    await cache.delete("k")  # deleting a missing key must not raise


async def test_incr_from_absent_key() -> None:
    cache = MemoryCache()
    assert await cache.incr("hits") == 1
    assert await cache.incr("hits") == 2
    assert await cache.get("hits") == "2"


async def test_incr_preserves_ttl(monkeypatch: pytest.MonkeyPatch) -> None:
    """Rate-limit counters depend on incr not resetting the window."""
    cache = MemoryCache()
    now = 500.0
    monkeypatch.setattr("app.cache.memory.time.monotonic", lambda: now)
    await cache.set("rl", "1", ttl=60)

    now = 530.0
    assert await cache.incr("rl") == 2

    now = 561.0
    assert await cache.get("rl") is None


def test_memory_cache_satisfies_protocol() -> None:
    assert isinstance(MemoryCache(), CacheBackend)


def test_factory_returns_memory_cache_by_default() -> None:
    from app.cache import get_cache

    get_cache.cache_clear()
    assert isinstance(get_cache(), MemoryCache)
    get_cache.cache_clear()


def test_redis_cache_is_explicitly_unimplemented() -> None:
    """Phase 2 — the seam exists but must fail loudly rather than silently no-op."""
    from app.cache import RedisCache

    with pytest.raises(NotImplementedError):
        RedisCache("redis://localhost:6379")
