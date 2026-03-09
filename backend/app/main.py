"""Omelette — Scientific Literature Lifecycle Management System."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db
from app.api.v1 import api_router

logging.basicConfig(
    level=logging.DEBUG if settings.app_debug else logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger("omelette")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Omelette v0.1.0 ...")
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list + ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


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
