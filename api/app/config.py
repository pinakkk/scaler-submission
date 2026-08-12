"""Application settings, loaded from the environment.

Local defaults are chosen so `uvicorn app.main:app` works with no .env at all.
Production overrides come from Fly secrets / `[env]` in fly.toml (see §12.2).
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from pydantic import field_validator
from pydantic_settings import (
    BaseSettings,
    DotEnvSettingsSource,
    EnvSettingsSource,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
)

# Fields we want read as `a,b` rather than as JSON when they come from the
# environment. Keeps .env files and Fly secrets human-writable.
_COMMA_SEPARATED_FIELDS = {"CORS_ORIGINS"}


class _CommaSeparatedEnvSource(EnvSettingsSource):
    def prepare_field_value(
        self, field_name: str, field: Any, value: Any, value_is_complex: bool
    ) -> Any:
        if field_name in _COMMA_SEPARATED_FIELDS and isinstance(value, str):
            return value  # hand the raw string to the field validator
        return super().prepare_field_value(field_name, field, value, value_is_complex)


class _CommaSeparatedDotEnvSource(DotEnvSettingsSource):
    def prepare_field_value(
        self, field_name: str, field: Any, value: Any, value_is_complex: bool
    ) -> Any:
        if field_name in _COMMA_SEPARATED_FIELDS and isinstance(value, str):
            return value
        return super().prepare_field_value(field_name, field, value, value_is_complex)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- Core ---------------------------------------------------------------
    ENVIRONMENT: str = "local"
    """One of: local | production. Drives prod-only behaviour (docs, defaults)."""

    # In production this is set to sqlite:////data/zoom.db (Fly volume, §12.2).
    # Note the four slashes: sqlite:/// + the absolute path /data/zoom.db.
    DATABASE_URL: str = "sqlite:///./zoom.db"

    # --- CORS ---------------------------------------------------------------
    # Comma-separated in the environment; a list in code.
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    # --- Auth (consumed in P12; declared here so the surface is stable) ------
    GOOGLE_CLIENT_ID: str = ""
    SECRET_KEY: str = "dev-insecure-change-me"

    # --- Cache (§9). Empty => MemoryCache; set => RedisCache (phase 2). ------
    REDIS_URL: str | None = None

    # --- TURN (§5.5) --------------------------------------------------------
    # Credentials are returned by POST /join, never baked into the client
    # bundle. All three must be set for a TURN entry to be emitted; unset means
    # STUN-only, which fails behind symmetric NAT.
    TURN_URLS: str = ""
    TURN_USERNAME: str = ""
    TURN_CREDENTIAL: str = ""

    # --- API surface --------------------------------------------------------
    API_V1_PREFIX: str = "/api/v1"
    PROJECT_NAME: str = "Zoom Clone API"

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        """Use comma-separated env sources for complex fields.

        Without this, pydantic-settings JSON-decodes any `list[str]` field
        straight from the environment and a plain `a,b` value raises before a
        `mode="before"` validator ever sees it.
        """
        return (
            init_settings,
            _CommaSeparatedEnvSource(settings_cls),
            _CommaSeparatedDotEnvSource(settings_cls),
            file_secret_settings,
        )

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _split_origins(cls, v: object) -> object:
        """Accept `a,b` as well as a JSON list."""
        if isinstance(v, str):
            stripped = v.strip()
            if not stripped:
                return []
            if stripped.startswith("["):
                return v  # let pydantic parse the JSON form
            return [origin.strip() for origin in stripped.split(",") if origin.strip()]
        return v

    @field_validator("REDIS_URL", mode="before")
    @classmethod
    def _empty_redis_is_none(cls, v: object) -> object:
        if isinstance(v, str) and not v.strip():
            return None
        return v

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() in {"production", "prod"}


@lru_cache
def get_settings() -> Settings:
    """Cached accessor — import this, not the class, so tests can clear the cache."""
    return Settings()


settings = get_settings()
