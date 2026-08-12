"""Business logic. The only layer permitted to touch `app.models` (§1.3).

Services are plain functions/classes taking a `Session` plus primitives — they
know nothing about HTTP. Failures are raised as `AppError` subclasses, which
`app.main` maps to the §4 error envelope, so a service never needs `HTTPException`.
"""

from __future__ import annotations

from app.services.errors import (
    AppError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    UnauthorizedError,
    ValidationError,
)

__all__ = [
    "AppError",
    "ConflictError",
    "ForbiddenError",
    "NotFoundError",
    "UnauthorizedError",
    "ValidationError",
]
