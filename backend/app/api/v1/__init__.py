"""API v1 router aggregation."""

from fastapi import APIRouter

from app.api.v1 import (
    activities,
    analysis,
    analytics,
    api_keys,
    audio_overviews,
    browser_upload,
    chat,
    collections,
    concepts,
    conversations,
    crawler,
    dedup,
    export,
    feed,
    gpu,
    keywords,
    library,
    notifications,
    ocr,
    papers,
    pipelines,
    projects,
    rag,
    reviews,
    rewrite,
    search,
    settings_api,
    subscription,
    tasks,
    team_members,
    upload,
    writing,
)

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(projects.router, prefix="/projects")
api_router.include_router(papers.router, prefix="/projects/{project_id}/papers")
api_router.include_router(upload.router, prefix="/projects/{project_id}/papers")
api_router.include_router(browser_upload.router, prefix="/projects/{project_id}/upload")
api_router.include_router(collections.router, prefix="/projects/{project_id}/collections")
api_router.include_router(activities.router, prefix="/projects/{project_id}/activities")
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
api_router.include_router(rewrite.router)
api_router.include_router(pipelines.router)
api_router.include_router(gpu.router)
api_router.include_router(analysis.router, prefix="/projects/{project_id}/analysis")
api_router.include_router(audio_overviews.router, prefix="/projects/{project_id}/audio-overviews")
api_router.include_router(reviews.router, prefix="/projects/{project_id}/reviews")
api_router.include_router(concepts.router, prefix="/projects/{project_id}/concepts")
api_router.include_router(library.router, prefix="/projects/{project_id}/library")
api_router.include_router(analytics.router, prefix="/projects/{project_id}/analytics")
api_router.include_router(feed.router, prefix="/projects/{project_id}/feed")
api_router.include_router(export.router)
api_router.include_router(team_members.router, prefix="/projects/{project_id}/members")
api_router.include_router(api_keys.router, prefix="/api-keys")
api_router.include_router(notifications.router, prefix="/projects/{project_id}/notifications")
