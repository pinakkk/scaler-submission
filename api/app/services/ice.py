"""ICE server configuration returned by `POST /join` (§5.5).

STUN entries are public and safe to hardcode. TURN credentials come from
settings (i.e. the environment / Fly secrets) so they are never baked into the
client bundle or this repo — if TURN is unconfigured we return the STUN entries
alone rather than emitting a half-formed TURN entry the browser would fail on.

Without TURN roughly 15-20% of real peer pairs never connect behind symmetric
NAT (§5.5); that is a deployment gap, not a code bug.
"""

from __future__ import annotations

from typing import Any, Final

from app.config import settings

STUN_SERVERS: Final[list[dict[str, Any]]] = [
    {"urls": "stun:stun.l.google.com:19302"},
    {"urls": "stun:stun1.l.google.com:19302"},
]


def get_ice_servers() -> list[dict[str, Any]]:
    """Build the §5.5 `ice_servers` array for the current environment."""
    servers: list[dict[str, Any]] = [dict(s) for s in STUN_SERVERS]

    turn_urls = settings.TURN_URLS.strip()
    username = settings.TURN_USERNAME.strip()
    credential = settings.TURN_CREDENTIAL.strip()

    # All three or none: a TURN entry without credentials is worse than absent,
    # because the browser will still try it and stall the ICE gathering window.
    if turn_urls and username and credential:
        urls = [u.strip() for u in turn_urls.split(",") if u.strip()]
        servers.append(
            {
                "urls": urls[0] if len(urls) == 1 else urls,
                "username": username,
                "credential": credential,
            }
        )
    return servers


def turn_is_configured() -> bool:
    return len(get_ice_servers()) > len(STUN_SERVERS)
