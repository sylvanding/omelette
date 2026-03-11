"""Optional API Key authentication middleware."""

import logging

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.config import settings

logger = logging.getLogger(__name__)

EXEMPT_PATHS = frozenset({"/", "/health", "/docs", "/openapi.json", "/redoc"})
EXEMPT_PREFIXES = ("/mcp",)


class ApiKeyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        if not settings.api_secret_key:
            return await call_next(request)

        if request.method == "OPTIONS":
            return await call_next(request)

        path = request.url.path
        if path in EXEMPT_PATHS or any(path.startswith(p) for p in EXEMPT_PREFIXES):
            return await call_next(request)

        api_key = request.headers.get("X-API-Key") or request.query_params.get("api_key")
        if api_key != settings.api_secret_key:
            return JSONResponse(
                status_code=401,
                content={"code": 401, "message": "Invalid or missing API key", "data": None},
            )

        return await call_next(request)
