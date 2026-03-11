"""API v1 router aggregation."""

from fastapi import APIRouter

from app.api.v1 import (
    chat,
    conversations,
    crawler,
    dedup,
    keywords,
    ocr,
    papers,
    projects,
    rag,
    search,
    settings_api,
    subscription,
    tasks,
    writing,
)

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(projects.router)
api_router.include_router(papers.router)
api_router.include_router(keywords.router)
api_router.include_router(search.router)
api_router.include_router(dedup.router)
api_router.include_router(crawler.router)
api_router.include_router(ocr.router)
api_router.include_router(subscription.router)
api_router.include_router(rag.router)
api_router.include_router(writing.router)
api_router.include_router(tasks.router)
api_router.include_router(settings_api.router)
api_router.include_router(conversations.router)
api_router.include_router(chat.router)
