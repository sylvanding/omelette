"""Optional API Key authentication middleware.

Supports two authentication modes:
1. Master key mode: If API_SECRET_KEY env var is set, all requests must include
   the matching X-API-Key header. Suitable for simple internal deployments.
2. Database-backed API keys: Use the `authenticate_api_key` FastAPI dependency
   for endpoints that require user-generated API key auth.

The middleware is disabled by default (api_secret_key defaults to empty string).
"""

import hashlib
import logging
from datetime import UTC, datetime

from fastapi import Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.api.deps import get_db
from app.config import settings
from app.models.api_key import APIKey

logger = logging.getLogger(__name__)

EXEMPT_PATHS = frozenset({"/", "/health", "/api/v1/settings/health", "/docs", "/openapi.json", "/redoc"})
EXEMPT_PREFIXES = ("/mcp",)

READ_SCOPES = frozenset({"read", "write", "admin"})
WRITE_SCOPES = frozenset({"write", "admin"})
ADMIN_SCOPES = frozenset({"admin"})


class ApiKeyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        if not settings.api_secret_key:
            return await call_next(request)

        if request.method == "OPTIONS":
            return await call_next(request)

        path = request.url.path
        if path in EXEMPT_PATHS or any(path.startswith(p) for p in EXEMPT_PREFIXES):
            return await call_next(request)

        api_key = request.headers.get("X-API-Key")
        if api_key != settings.api_secret_key:
            return JSONResponse(
                status_code=401,
                content={"code": 401, "message": "Invalid or missing API key", "data": None},
            )

        return await call_next(request)


# ---------------------------------------------------------------------------
# Database-backed API key authentication (FastAPI dependency)
# ---------------------------------------------------------------------------


async def authenticate_api_key(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> APIKey:
    """FastAPI dependency that validates X-API-Key header against database-stored keys.

    Returns the authenticated APIKey record. Raises 401 if missing/invalid.
    Usage:
        @router.get("/protected", dependencies=[Depends(authenticate_api_key)])
    """
    raw_key = request.headers.get("x-api-key")
    if not raw_key:
        raise JSONResponse(
            status_code=401,
            content={"code": 401, "message": "Missing API key. Provide X-API-Key header.", "data": None},
        )

    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    stmt = select(APIKey).where(APIKey.key_hash == key_hash, APIKey.is_active)
    result = await db.execute(stmt)
    api_key = result.scalars().first()

    if not api_key:
        raise JSONResponse(
            status_code=401,
            content={"code": 401, "message": "Invalid or revoked API key", "data": None},
        )

    api_key.last_used_at = datetime.now(UTC)
    await db.flush()
    return api_key


def require_scope(scope: str):
    """FastAPI dependency factory that enforces a minimum API key scope.

    Usage:
        @router.post("...", dependencies=[Depends(require_scope("write"))])

    Scopes: read < write < admin
    """
    allowed = {
        "read": READ_SCOPES,
        "write": WRITE_SCOPES,
        "admin": ADMIN_SCOPES,
    }[scope]

    async def _check_scope(request: Request) -> None:
        current_scope = getattr(request.state, "api_key_scope", None)
        if not current_scope or current_scope not in allowed:
            raise JSONResponse(
                status_code=403,
                content={"code": 403, "message": f"Insufficient scope. Required: {scope}", "data": None},
            )

    return _check_scope


def require_authenticated_api_key(scope: str = "read"):
    """Combined dependency: authenticate API key AND check scope.

    Usage:
        @router.get(
            "/protected",
            dependencies=[Depends(require_authenticated_api_key("write"))],
        )
    """
    allowed = {
        "read": READ_SCOPES,
        "write": WRITE_SCOPES,
        "admin": ADMIN_SCOPES,
    }[scope]

    async def _check(
        request: Request,
        api_key: APIKey = Depends(authenticate_api_key),
    ) -> None:
        if api_key.scope not in allowed:
            raise JSONResponse(
                status_code=403,
                content={"code": 403, "message": f"Insufficient scope. Required: {scope}", "data": None},
            )
        request.state.api_key_scope = api_key.scope
        request.state.api_key_id = api_key.id
        request.state.api_key = api_key

    return _check
