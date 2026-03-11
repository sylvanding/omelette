"""Omelette — Scientific Literature Lifecycle Management System."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import api_router
from app.config import settings
from app.database import init_db
from app.middleware.auth import ApiKeyMiddleware

logging.basicConfig(
    level=logging.DEBUG if settings.app_debug else logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger("omelette")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Omelette v0.1.0 ...")
    if settings.app_env == "production" and settings.app_secret_key == "change-me-to-a-random-secret-key":
        logger.warning("SECURITY: Using default secret key in production! Set APP_SECRET_KEY in .env")
    await init_db()
    logger.info("Database initialized")
    yield
    logger.info("Shutting down Omelette")


app = FastAPI(
    title="Omelette API",
    description="Scientific Literature Lifecycle Management System / 科研文献全生命周期管理系统",
    version="0.1.0",
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
)

app.include_router(api_router)

# MCP Server — expose tools and resources to AI IDEs
try:
    from app.mcp_server import mcp as mcp_server

    mcp_app = mcp_server.streamable_http_app()
    app.mount("/mcp", mcp_app)
    logger.info("MCP server mounted at /mcp")
except Exception as e:
    logger.warning("MCP server mount failed: %s", e)


@app.get("/")
async def root():
    return {
        "name": "Omelette",
        "version": "0.1.0",
        "description": "Scientific Literature Lifecycle Management System",
        "docs": "/docs",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.app_host,
        port=settings.app_port,
        reload=settings.app_debug,
    )
