"""Omelette — Scientific Literature Lifecycle Management System."""

import atexit
import contextlib
import logging
import os
import signal
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1 import api_router
from app.config import settings
from app.database import engine, init_db
from app.middleware.auth import ApiKeyMiddleware
from app.middleware.rate_limit import setup_rate_limiting
from app.schemas.common import ApiResponse

logging.basicConfig(
    level=logging.DEBUG if settings.app_debug else logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger("omelette")

_cleanup_done = False


def _sync_cleanup() -> None:
    """Synchronous cleanup: release GPU models and kill MinerU processes.

    Safe to call multiple times (idempotent via _cleanup_done flag).
    Registered with atexit and called from signal handlers.
    """
    global _cleanup_done  # noqa: PLW0603
    if _cleanup_done:
        return
    _cleanup_done = True

    logger.info("Running sync cleanup (atexit / signal)")
    try:
        from app.services.gpu_model_manager import gpu_model_manager

        gpu_model_manager.unload_all()
    except Exception:
        logger.warning("GPU model cleanup failed", exc_info=True)

    try:
        from app.services.mineru_process_manager import mineru_process_manager

        mineru_process_manager.stop_sync()
    except Exception:
        logger.warning("MinerU cleanup failed", exc_info=True)

    with contextlib.suppress(OSError):
        Path(settings.pid_file).unlink(missing_ok=True)


def _handle_sighup(signum: int, frame: object) -> None:
    """Handle terminal close (SIGHUP): cleanup and exit."""
    logger.info("Received SIGHUP — cleaning up and exiting")
    _sync_cleanup()
    sys.exit(0)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.pipelines.graphs import set_checkpointer
    from app.services.gpu_model_manager import gpu_model_manager
    from app.services.mineru_process_manager import mineru_process_manager

    logger.info("Starting Omelette v%s ...", settings.app_version)
    if settings.app_env == "production" and settings.app_secret_key == "change-me-to-a-random-secret-key":
        logger.warning("SECURITY: Using default secret key in production! Set APP_SECRET_KEY in .env")
    await init_db()
    logger.info("Database initialized")

    # Write PID file
    pid_path = Path(settings.pid_file)
    pid_path.parent.mkdir(parents=True, exist_ok=True)
    pid_path.write_text(str(os.getpid()))
    logger.info("PID file: %s (pid=%d)", pid_path, os.getpid())

    # Register safety nets
    atexit.register(_sync_cleanup)
    with contextlib.suppress(OSError, ValueError):
        signal.signal(signal.SIGHUP, _handle_sighup)

    # Pipeline checkpoint persistence (AsyncSqliteSaver)
    checkpoint_cm = None
    try:
        from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

        db_path = settings.pipeline_checkpoint_db
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        cm = AsyncSqliteSaver.from_conn_string(db_path)
        saver = await cm.__aenter__()
        checkpoint_cm = cm
        set_checkpointer(saver)
        logger.info("Pipeline checkpoint DB: %s", db_path)
    except Exception as e:
        logger.warning("AsyncSqliteSaver unavailable, using MemorySaver: %s", e)
        set_checkpointer(None)

    await gpu_model_manager.start()
    await mineru_process_manager.start()
    yield
    logger.info("Shutting down Omelette")
    await mineru_process_manager.stop()
    await gpu_model_manager.stop()
    if checkpoint_cm is not None:
        try:
            await checkpoint_cm.__aexit__(None, None, None)
        except Exception as e:
            logger.warning("Checkpoint saver teardown: %s", e)
        set_checkpointer(None)
    await engine.dispose()

    with contextlib.suppress(OSError):
        Path(settings.pid_file).unlink(missing_ok=True)
    global _cleanup_done  # noqa: PLW0603
    _cleanup_done = True


app = FastAPI(
    title="Omelette API",
    description="Scientific Literature Lifecycle Management System / 科研文献全生命周期管理系统",
    version=settings.app_version,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(ApiKeyMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "X-Process-Time"],
    max_age=600,
)

setup_rate_limiting(app)
app.include_router(api_router)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Wrap HTTPException in ApiResponse format for consistent frontend handling."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": exc.status_code, "message": exc.detail, "data": None},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Wrap Pydantic validation errors in ApiResponse format."""
    errors = []
    for err in exc.errors():
        clean = {k: v for k, v in err.items() if k != "ctx"}
        if "ctx" in err:
            clean["ctx"] = {k: str(v) for k, v in err["ctx"].items()}
        errors.append(clean)
    return JSONResponse(
        status_code=422,
        content={"code": 422, "message": "Validation error", "data": errors},
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Return sanitised error in production, full detail in debug mode."""
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    detail = str(exc) if settings.app_debug else "Internal server error"
    return JSONResponse(
        status_code=500,
        content={"code": 500, "message": detail, "data": None},
    )


# MCP Server — expose tools and resources to AI IDEs
try:
    from app.mcp_server import mcp as mcp_server

    mcp_app = mcp_server.streamable_http_app()
    app.mount("/mcp", mcp_app)
    logger.info("MCP server mounted at /mcp")
except Exception:
    logger.error("MCP server mount failed", exc_info=True)


@app.get("/health")
async def health():
    """Health check endpoint — exempt from API key authentication."""
    return ApiResponse(data={"status": "ok"})


@app.get("/")
async def root():
    return ApiResponse(
        data={
            "name": "Omelette",
            "version": settings.app_version,
            "description": "Scientific Literature Lifecycle Management System",
            "docs": "/docs",
        }
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.app_host,
        port=settings.app_port,
        reload=settings.app_debug,
    )
