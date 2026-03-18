"""Pipeline orchestration API — start, status, resume, cancel LangGraph pipelines."""

import asyncio
import logging
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_project_or_404
from app.config import settings
from app.middleware.rate_limit import limiter
from app.models.task import Task, TaskStatus, TaskType
from app.schemas.common import ApiResponse
from app.websocket.manager import pipeline_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pipelines", tags=["pipelines"])

_running_tasks: dict[str, dict] = {}
_cancelled: dict[str, bool] = {}


class SearchPipelineRequest(BaseModel):
    project_id: int
    query: str = ""
    sources: list[str] | None = None
    max_results: int = Field(50, ge=1, le=200)


class UploadPipelineRequest(BaseModel):
    project_id: int
    pdf_paths: list[str]


class ResolvedConflict(BaseModel):
    conflict_id: str
    action: Literal["keep_old", "keep_new", "merge", "skip"]
    merged_paper: dict | None = None


class ResumeRequest(BaseModel):
    resolved_conflicts: list[ResolvedConflict] = []


@router.get("", response_model=ApiResponse[list[dict]])
async def list_pipelines(
    status: str | None = None,
):
    """List all pipelines (running, interrupted, completed, failed, cancelled)."""
    data = []
    for thread_id, task in _running_tasks.items():
        if status and task["status"] != status:
            continue
        data.append(
            {
                "thread_id": thread_id,
                "status": task["status"],
                "task_id": task.get("task_id"),
            }
        )
    return ApiResponse(data=data)


@router.post("/search", response_model=ApiResponse[dict])
@limiter.limit("10/minute")
async def start_search_pipeline(
    request: Request,
    body: SearchPipelineRequest,
    db: AsyncSession = Depends(get_db),
):
    """Start a keyword-search pipeline: search → dedup → crawl → OCR → index."""
    await get_project_or_404(body.project_id, db)

    from app.pipelines.graphs import create_search_pipeline

    thread_id = f"search_{uuid.uuid4().hex[:12]}"
    pipeline = create_search_pipeline()

    initial_state = {
        "project_id": body.project_id,
        "thread_id": thread_id,
        "pipeline_type": "search",
        "params": {
            "query": body.query,
            "sources": body.sources,
            "max_results": body.max_results,
        },
        "papers": [],
        "conflicts": [],
        "resolved_conflicts": [],
        "progress": 0,
        "total": 100,
        "stage": "starting",
        "error": None,
        "cancelled": False,
        "result": {},
    }

    config = {"configurable": {"thread_id": thread_id}}

    task_record = Task(
        project_id=body.project_id,
        task_type=TaskType.SEARCH,
        status=TaskStatus.RUNNING,
        progress=0,
        total=100,
        result={"thread_id": thread_id, "pipeline_type": "search"},
    )
    db.add(task_record)
    await db.flush()

    _running_tasks[thread_id] = {
        "status": "running",
        "pipeline": pipeline,
        "config": config,
        "task_id": task_record.id,
        "project_id": body.project_id,
    }

    async def _run():
        try:
            result = await pipeline.ainvoke(initial_state, config=config)
            snapshot = pipeline.get_state(config)
            if snapshot and snapshot.next:
                _running_tasks[thread_id]["status"] = "interrupted"
                _running_tasks[thread_id]["result"] = result
            else:
                _running_tasks[thread_id]["status"] = "completed"
                _running_tasks[thread_id]["result"] = result
            await pipeline_manager.broadcast_to_room(
                thread_id,
                {
                    "type": "status",
                    "status": _running_tasks[thread_id]["status"],
                    "stage": result.get("stage", ""),
                    "progress": result.get("progress", 0),
                },
            )
        except asyncio.CancelledError:
            _running_tasks[thread_id]["status"] = "cancelled"
            await pipeline_manager.broadcast_to_room(thread_id, {"type": "status", "status": "cancelled"})
        except Exception as e:
            logger.error("Pipeline %s failed: %s", thread_id, e)
            _running_tasks[thread_id]["status"] = "failed"
            _running_tasks[thread_id]["error"] = str(e)
            await pipeline_manager.broadcast_to_room(thread_id, {"type": "error", "message": str(e)})

    task_ref = asyncio.create_task(_run())
    _running_tasks[thread_id]["asyncio_task"] = task_ref

    return ApiResponse(
        data={
            "thread_id": thread_id,
            "status": "running",
            "project_id": body.project_id,
            "task_id": task_record.id,
        }
    )


@router.post("/upload", response_model=ApiResponse[dict])
@limiter.limit("10/minute")
async def start_upload_pipeline(
    request: Request,
    body: UploadPipelineRequest,
    db: AsyncSession = Depends(get_db),
):
    """Start a PDF-upload pipeline: extract → dedup → OCR → index."""
    from pathlib import Path as _Path

    from app.config import settings

    await get_project_or_404(body.project_id, db)

    allowed_root = _Path(settings.pdf_dir).resolve()
    safe_paths: list[str] = []
    for p in body.pdf_paths:
        resolved = _Path(p).resolve()
        if not resolved.is_relative_to(allowed_root):
            raise HTTPException(status_code=400, detail=f"Path not within allowed directory: {p}")
        safe_paths.append(str(resolved))

    from app.pipelines.graphs import create_upload_pipeline

    thread_id = f"upload_{uuid.uuid4().hex[:12]}"
    pipeline = create_upload_pipeline()

    initial_state = {
        "project_id": body.project_id,
        "thread_id": thread_id,
        "pipeline_type": "upload",
        "params": {"pdf_paths": safe_paths},
        "papers": [],
        "conflicts": [],
        "resolved_conflicts": [],
        "progress": 0,
        "total": 100,
        "stage": "starting",
        "error": None,
        "cancelled": False,
        "result": {},
    }

    config = {"configurable": {"thread_id": thread_id}}

    task_record = Task(
        project_id=body.project_id,
        task_type=TaskType.OCR,
        status=TaskStatus.RUNNING,
        progress=0,
        total=100,
        result={"thread_id": thread_id, "pipeline_type": "upload"},
    )
    db.add(task_record)
    await db.flush()

    _running_tasks[thread_id] = {
        "status": "running",
        "pipeline": pipeline,
        "config": config,
        "task_id": task_record.id,
        "project_id": body.project_id,
    }

    async def _run():
        try:
            result = await pipeline.ainvoke(initial_state, config=config)
            snapshot = pipeline.get_state(config)
            if snapshot and snapshot.next:
                _running_tasks[thread_id]["status"] = "interrupted"
                _running_tasks[thread_id]["result"] = result
            else:
                _running_tasks[thread_id]["status"] = "completed"
                _running_tasks[thread_id]["result"] = result
            await pipeline_manager.broadcast_to_room(
                thread_id,
                {
                    "type": "status",
                    "status": _running_tasks[thread_id]["status"],
                    "stage": result.get("stage", ""),
                    "progress": result.get("progress", 0),
                },
            )
        except asyncio.CancelledError:
            _running_tasks[thread_id]["status"] = "cancelled"
            await pipeline_manager.broadcast_to_room(thread_id, {"type": "status", "status": "cancelled"})
        except Exception as e:
            logger.error("Pipeline %s failed: %s", thread_id, e)
            _running_tasks[thread_id]["status"] = "failed"
            _running_tasks[thread_id]["error"] = str(e)
            await pipeline_manager.broadcast_to_room(thread_id, {"type": "error", "message": str(e)})

    task_ref = asyncio.create_task(_run())
    _running_tasks[thread_id]["asyncio_task"] = task_ref

    return ApiResponse(
        data={
            "thread_id": thread_id,
            "status": "running",
            "project_id": body.project_id,
            "task_id": task_record.id,
        }
    )


@router.get("/{thread_id}/status", response_model=ApiResponse[dict])
async def get_pipeline_status(thread_id: str):
    """Get pipeline execution status."""
    task = _running_tasks.get(thread_id)
    if not task:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    data: dict = {
        "thread_id": thread_id,
        "status": task["status"],
    }

    if task["status"] == "interrupted":
        pipeline = task.get("pipeline")
        config = task.get("config")
        if pipeline and config:
            try:
                snapshot = pipeline.get_state(config)
                if snapshot and snapshot.next:
                    data["interrupted_at"] = list(snapshot.next)
                state = snapshot.values if snapshot else {}
                data["conflicts"] = state.get("conflicts", [])
                data["stage"] = state.get("stage", "")
                data["progress"] = state.get("progress", 0)
            except Exception:
                logger.warning("Failed to read pipeline state for task %s", thread_id, exc_info=True)

    if task["status"] == "completed":
        result = task.get("result", {})
        data["stage"] = result.get("stage", "completed")
        data["progress"] = result.get("progress", 100)
        data["result"] = result.get("result", {})

    if task.get("error"):
        data["error"] = task["error"]

    return ApiResponse(data=data)


@router.post("/{thread_id}/resume", response_model=ApiResponse[dict])
async def resume_pipeline(thread_id: str, body: ResumeRequest):
    """Resume an interrupted pipeline with resolved conflicts."""
    from langgraph.types import Command

    task = _running_tasks.get(thread_id)
    if not task:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    if task["status"] == "cancelled":
        raise HTTPException(status_code=400, detail="Pipeline was cancelled, cannot resume")
    if task["status"] != "interrupted":
        raise HTTPException(status_code=400, detail=f"Pipeline is {task['status']}, not interrupted")

    pipeline = task["pipeline"]
    config = task["config"]
    task["status"] = "running"

    raw_conflicts = [rc.model_dump() for rc in body.resolved_conflicts]

    async def _resume():
        try:
            result = await pipeline.ainvoke(
                Command(resume=raw_conflicts),
                config=config,
            )
            snapshot = pipeline.get_state(config)
            if snapshot and snapshot.next:
                task["status"] = "interrupted"
            else:
                task["status"] = "completed"
            task["result"] = result
        except asyncio.CancelledError:
            task["status"] = "cancelled"
        except Exception as e:
            logger.error("Pipeline resume %s failed: %s", thread_id, e)
            task["status"] = "failed"
            task["error"] = str(e)

    task_ref = asyncio.create_task(_resume())
    task["asyncio_task"] = task_ref

    return ApiResponse(data={"thread_id": thread_id, "status": "running"})


@router.post("/{thread_id}/cancel", response_model=ApiResponse[dict])
async def cancel_pipeline(thread_id: str):
    """Cancel a running or interrupted pipeline."""
    task = _running_tasks.get(thread_id)
    if not task:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    if task["status"] in ("completed", "failed"):
        raise HTTPException(status_code=400, detail=f"Pipeline already {task['status']}")

    _cancelled[thread_id] = True
    task["status"] = "cancelled"

    asyncio_task = task.get("asyncio_task")
    if asyncio_task and not asyncio_task.done():
        asyncio_task.cancel()

    await pipeline_manager.broadcast_to_room(thread_id, {"type": "status", "status": "cancelled"})
    return ApiResponse(data={"thread_id": thread_id, "status": "cancelled"})


@router.websocket("/{thread_id}/ws")
async def pipeline_status_websocket(
    websocket: WebSocket,
    thread_id: str,
    api_key: str | None = Query(default=None),
):
    """WebSocket endpoint for real-time pipeline status updates."""
    if settings.api_secret_key and api_key != settings.api_secret_key:
        await websocket.close(code=4008)
        return

    await pipeline_manager.connect(websocket, thread_id)
    try:
        task = _running_tasks.get(thread_id)
        if task:
            await websocket.send_json(
                {
                    "type": "status",
                    "status": task["status"],
                    "thread_id": thread_id,
                }
            )
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pipeline_manager.disconnect(websocket, thread_id)
