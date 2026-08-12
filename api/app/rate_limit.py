"""The shared slowapi limiter (§4).

Lives outside `main` so routers can decorate handlers without importing the app
module that imports them — the circular import that would otherwise force every
limit to be declared centrally, far from the route it guards.

In-memory counters. Single instance / single worker (§9, §12.2), so in-process
state is authoritative; past one replica this must move to Redis.
"""

from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address, default_limits=[])
