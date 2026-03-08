"""Error classes for the Council SDK."""

from __future__ import annotations

from typing import Any, Optional


class CouncilError(Exception):
    """Base exception for all Council SDK errors."""

    def __init__(
        self,
        message: str,
        code: Optional[str] = None,
        status_code: Optional[int] = None,
        request_id: Optional[str] = None,
        details: Optional[dict[str, Any]] = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code or "council_error"
        self.status_code = status_code
        self.request_id = request_id
        self.details = details or {}

    def __repr__(self) -> str:
        return (
            f"{self.__class__.__name__}("
            f"message={self.message!r}, code={self.code!r}, "
            f"status_code={self.status_code})"
        )


class AuthenticationError(CouncilError):
    """Invalid or expired credentials."""

    def __init__(self, message: str = "Authentication failed", **kwargs: Any) -> None:
        super().__init__(message, code="authentication_error", status_code=401, **kwargs)


class AuthorizationError(CouncilError):
    """Insufficient permissions or scopes."""

    def __init__(self, message: str = "Authorization failed", **kwargs: Any) -> None:
        super().__init__(message, code="authorization_error", status_code=403, **kwargs)


class ValidationError(CouncilError):
    """Invalid request parameters."""

    def __init__(
        self,
        message: str = "Validation failed",
        field: Optional[str] = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(message, code="validation_error", status_code=400, **kwargs)
        self.field = field


class NotFoundError(CouncilError):
    """Resource not found."""

    def __init__(self, message: str = "Resource not found", **kwargs: Any) -> None:
        super().__init__(message, code="not_found", status_code=404, **kwargs)


class RateLimitError(CouncilError):
    """Too many requests."""

    def __init__(
        self,
        message: str = "Rate limit exceeded",
        retry_after: float = 0,
        **kwargs: Any,
    ) -> None:
        super().__init__(message, code="rate_limit_exceeded", status_code=429, **kwargs)
        self.retry_after = retry_after


class JuryDeniedError(CouncilError):
    """Jury deliberation resulted in denial."""

    def __init__(
        self,
        message: str = "Jury denied the action",
        reasoning: str = "",
        votes: Optional[list[dict[str, Any]]] = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(message, code="jury_denied", status_code=200, **kwargs)
        self.reasoning = reasoning
        self.votes = votes or []


class JuryTimeoutError(CouncilError):
    """Jury deliberation timed out."""

    def __init__(self, message: str = "Jury deliberation timed out", **kwargs: Any) -> None:
        super().__init__(message, code="jury_timeout", status_code=408, **kwargs)


class SandboxError(CouncilError):
    """Code execution failure."""

    def __init__(self, message: str = "Sandbox execution failed", **kwargs: Any) -> None:
        super().__init__(message, code="sandbox_error", status_code=500, **kwargs)


class SandboxTimeoutError(SandboxError):
    """Sandbox execution timed out."""

    def __init__(self, message: str = "Sandbox execution timed out", **kwargs: Any) -> None:
        super().__init__(message, **kwargs)
        self.code = "sandbox_timeout"


class SandboxMemoryError(SandboxError):
    """Sandbox memory limit exceeded."""

    def __init__(self, message: str = "Sandbox memory limit exceeded", **kwargs: Any) -> None:
        super().__init__(message, **kwargs)
        self.code = "sandbox_memory"


class NetworkError(CouncilError):
    """Connection or network issue."""

    def __init__(self, message: str = "Network error", **kwargs: Any) -> None:
        super().__init__(message, code="network_error", **kwargs)


# ── Error mapping from HTTP responses ──────────────────────────────────────────

_STATUS_ERROR_MAP: dict[int, type[CouncilError]] = {
    400: ValidationError,
    401: AuthenticationError,
    403: AuthorizationError,
    404: NotFoundError,
    429: RateLimitError,
}


def raise_for_status(status_code: int, body: dict[str, Any]) -> None:
    """Parse an error response and raise the appropriate CouncilError subclass."""
    error_data = body.get("error", body)
    if isinstance(error_data, str):
        message = error_data
        code = None
        details_dict: dict[str, Any] = {}
    else:
        message = error_data.get("message", str(error_data))
        code = error_data.get("code")
        details_dict = error_data.get("details", {})

    request_id = body.get("request_id") or body.get("requestId")

    error_cls = _STATUS_ERROR_MAP.get(status_code, CouncilError)

    kwargs: dict[str, Any] = {
        "request_id": request_id,
        "details": details_dict if isinstance(details_dict, dict) else {},
    }

    if error_cls is RateLimitError:
        retry_after = float(body.get("retry_after", body.get("retryAfter", 0)))
        raise RateLimitError(message, retry_after=retry_after, **kwargs)

    if error_cls is ValidationError:
        field = None
        if isinstance(details_dict, list) and details_dict:
            field = details_dict[0].get("field")
        elif isinstance(details_dict, dict):
            field = details_dict.get("field")
        raise ValidationError(message, field=field, **kwargs)

    raise error_cls(message, **kwargs)
