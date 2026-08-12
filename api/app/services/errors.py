"""Application error hierarchy.

`AppError` lives in the services layer on purpose: business logic raises these,
routers never construct HTTP error responses by hand. `main.py` installs a single
handler that maps any `AppError` to the §4 envelope:

    {"error": {"code": ..., "message": ..., "details": {...}}}

Subclasses only need to set `status_code` and `code`.
"""

from __future__ import annotations

from typing import Any


class AppError(Exception):
    """Base class for every expected, client-facing failure."""

    status_code: int = 400
    code: str = "BAD_REQUEST"
    message: str = "The request could not be processed."

    def __init__(
        self,
        message: str | None = None,
        *,
        code: str | None = None,
        status_code: int | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        self.message = message or self.__class__.message
        self.code = code or self.__class__.code
        self.status_code = status_code or self.__class__.status_code
        self.details: dict[str, Any] = details or {}
        super().__init__(self.message)

    def to_envelope(self) -> dict[str, Any]:
        """Render the §4 error envelope."""
        return {
            "error": {
                "code": self.code,
                "message": self.message,
                "details": self.details,
            }
        }


class NotFoundError(AppError):
    status_code = 404
    code = "NOT_FOUND"
    message = "The requested resource does not exist."


class ValidationError(AppError):
    status_code = 422
    code = "VALIDATION_ERROR"
    message = "The request payload is invalid."


class UnauthorizedError(AppError):
    status_code = 401
    code = "UNAUTHORIZED"
    message = "Authentication is required."


class ForbiddenError(AppError):
    status_code = 403
    code = "FORBIDDEN"
    message = "You do not have permission to perform this action."


class ConflictError(AppError):
    status_code = 409
    code = "CONFLICT"
    message = "The request conflicts with the current state."
