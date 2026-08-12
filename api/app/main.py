"""FastAPI application entrypoint.

Wires: lifespan (init_db), CORS from settings, slowapi rate limiting (§4), the
`/api/v1` router prefix, and the global error envelope from §4.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import settings
from app.database import init_db, verify_pragmas
from app.routers import health as health_router
from app.services.errors import AppError

# Attach to uvicorn's handlers so app logs actually surface under `uvicorn`
# (a bare getLogger has no handler and the startup pragma line is swallowed).
logger = logging.getLogger("app")
_uvicorn_logger = logging.getLogger("uvicorn")
if _uvicorn_logger.handlers:
    logger.handlers = _uvicorn_logger.handlers
    logger.setLevel(_uvicorn_logger.level or logging.INFO)
else:
    logging.basicConfig(level=logging.INFO)

# In-memory limiter (§4). Single instance / single worker, so in-process
# counters are authoritative — see §9's note on scaling past one instance.
limiter = Limiter(key_func=get_remote_address, default_limits=[])


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    init_db()
    pragmas = verify_pragmas()
    if pragmas:
        logger.info("SQLite pragmas: %s", pragmas)
    yield


def error_response(
    status_code: int, code: str, message: str, details: dict[str, Any] | None = None
) -> JSONResponse:
    """Render the §4 error envelope. Single place this shape is produced."""
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message, "details": details or {}}},
    )


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.PROJECT_NAME,
        version="0.1.0",
        lifespan=lifespan,
        # Keep the interactive docs off in production.
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None if settings.is_production else "/redoc",
        openapi_url=None if settings.is_production else "/openapi.json",
    )

    # --- Rate limiting (§4) ------------------------------------------------
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)

    # --- CORS --------------------------------------------------------------
    # The browser calls this API directly (§1.2), so CORS is load-bearing, and
    # credentials + explicit origins are required (a wildcard would break auth).
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # --- Error envelope (§4) ------------------------------------------------
    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        return error_response(exc.status_code, exc.code, exc.message, exc.details)

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_exception(
        request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        # Normalize framework-raised HTTP errors into the same envelope so the
        # frontend only ever parses one error shape.
        code = HTTP_ERROR_CODES.get(exc.status_code, "HTTP_ERROR")
        return error_response(exc.status_code, code, str(exc.detail))

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return error_response(
            422,
            "VALIDATION_ERROR",
            "The request payload is invalid.",
            {"errors": _jsonable_errors(exc.errors())},
        )

    @app.exception_handler(Exception)
    async def handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
        # Never leak internals to the client; log the full traceback instead.
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return error_response(500, "INTERNAL_ERROR", "An unexpected error occurred.", {})

    # --- Routers ------------------------------------------------------------
    app.include_router(health_router.router, prefix=settings.API_V1_PREFIX)

    return app


HTTP_ERROR_CODES: dict[int, str] = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMITED",
    500: "INTERNAL_ERROR",
}


def _jsonable_errors(errors: list[Any]) -> list[dict[str, Any]]:
    """Strip non-serializable bits (e.g. `ctx` exceptions) from pydantic errors."""
    cleaned: list[dict[str, Any]] = []
    for err in errors:
        cleaned.append(
            {
                "loc": [str(part) for part in err.get("loc", ())],
                "msg": err.get("msg", ""),
                "type": err.get("type", ""),
            }
        )
    return cleaned


app = create_app()
