"""Tests for LangGraph pipeline orchestration engine."""

import pytest
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import Command

from app.database import Base, engine
from app.models import Paper, Project
from app.pipelines.graphs import create_search_pipeline, create_upload_pipeline
from app.pipelines.state import PipelineState


@pytest.fixture(autouse=True)
async def setup_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def project(setup_db):
    from app.database import async_session_factory

    async with async_session_factory() as db:
        p = Project(name="test-pipeline-kb", description="test")
        db.add(p)
        await db.commit()
        await db.refresh(p)
        return p


# ── PipelineState TypedDict ──


def test_pipeline_state_keys():
    state: PipelineState = {
        "papers": [],
        "conflicts": [],
        "resolved_conflicts": [],
        "task_id": 1,
        "project_id": 1,
        "thread_id": "t1",
        "progress": 0,
        "total": 100,
        "stage": "starting",
        "pipeline_type": "search",
        "params": {},
        "error": None,
        "cancelled": False,
        "result": {},
    }
    assert state["pipeline_type"] == "search"
    assert state["progress"] == 0


# ── Graph compilation ──


def test_search_pipeline_compiles():
    saver = MemorySaver()
    graph = create_search_pipeline(checkpointer=saver)
    assert graph is not None


def test_upload_pipeline_compiles():
    saver = MemorySaver()
    graph = create_upload_pipeline(checkpointer=saver)
    assert graph is not None


# ── SearchPipeline: mock search returning empty results ──


async def test_search_pipeline_empty(project, monkeypatch):
    """Search pipeline with empty results should complete without errors."""

    async def mock_search(self, query="", sources=None, max_results=100):
        return {"papers": [], "total": 0, "sources_queried": []}

    from app.services import search_service

    monkeypatch.setattr(search_service.SearchService, "search", mock_search)

    saver = MemorySaver()
    graph = create_search_pipeline(checkpointer=saver)

    initial: PipelineState = {
        "project_id": project.id,
        "thread_id": "test_search_empty",
        "pipeline_type": "search",
        "params": {"query": "test", "max_results": 10},
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

    config = {"configurable": {"thread_id": "test_search_empty"}}
    result = await graph.ainvoke(initial, config=config)

    assert result["stage"] == "index"
    assert result["progress"] == 100


# ── SearchPipeline: mock search with results, no conflicts ──


async def test_search_pipeline_with_papers(project, monkeypatch):
    """Papers from search should be imported and pass through all nodes."""

    async def mock_search(self, query="", sources=None, max_results=100):
        return {
            "papers": [
                {
                    "title": "Test Paper Alpha",
                    "doi": "10.1234/alpha",
                    "abstract": "Alpha abstract",
                    "year": 2025,
                    "journal": "J Test",
                    "source": "semantic_scholar",
                    "pdf_url": "",
                }
            ],
            "total": 1,
        }

    from app.services import search_service

    monkeypatch.setattr(search_service.SearchService, "search", mock_search)

    saver = MemorySaver()
    graph = create_search_pipeline(checkpointer=saver)

    initial: PipelineState = {
        "project_id": project.id,
        "thread_id": "test_search_papers",
        "pipeline_type": "search",
        "params": {"query": "test", "max_results": 10},
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

    config = {"configurable": {"thread_id": "test_search_papers"}}
    result = await graph.ainvoke(initial, config=config)

    assert result["progress"] == 100
    assert result["stage"] == "index"

    from sqlalchemy import select

    from app.database import async_session_factory

    async with async_session_factory() as db:
        papers = (await db.execute(select(Paper).where(Paper.project_id == project.id))).scalars().all()
        assert len(papers) == 1
        assert papers[0].title == "Test Paper Alpha"


# ── Dedup conflict triggers HITL interrupt ──


async def test_dedup_conflict_interrupt(project, monkeypatch):
    """When dedup finds a conflict, the pipeline should interrupt at hitl_dedup."""
    from app.database import async_session_factory

    async with async_session_factory() as db:
        existing = Paper(
            project_id=project.id,
            title="Existing Paper",
            doi="10.1234/exist",
            source="manual",
        )
        db.add(existing)
        await db.commit()

    async def mock_search(self, query="", sources=None, max_results=100):
        return {
            "papers": [
                {
                    "title": "Existing Paper (duplicate)",
                    "doi": "10.1234/exist",
                    "abstract": "Duplicate",
                    "year": 2025,
                    "journal": "",
                    "source": "search",
                    "pdf_url": "",
                }
            ],
            "total": 1,
        }

    from app.services import search_service

    monkeypatch.setattr(search_service.SearchService, "search", mock_search)

    saver = MemorySaver()
    graph = create_search_pipeline(checkpointer=saver)

    initial: PipelineState = {
        "project_id": project.id,
        "thread_id": "test_conflict",
        "pipeline_type": "search",
        "params": {"query": "exist", "max_results": 10},
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

    config = {"configurable": {"thread_id": "test_conflict"}}

    await graph.ainvoke(initial, config=config)

    snapshot = graph.get_state(config)
    assert "hitl_dedup" in snapshot.next, f"Expected interrupt at hitl_dedup, got next={snapshot.next}"
    conflicts = snapshot.values.get("conflicts", [])
    assert len(conflicts) == 1
    assert conflicts[0]["reason"] == "doi_duplicate"


# ── Resume after HITL interrupt ──


async def test_resume_after_interrupt(project, monkeypatch):
    """After resolving conflicts, the pipeline should resume and complete."""
    from app.database import async_session_factory

    async with async_session_factory() as db:
        existing = Paper(
            project_id=project.id,
            title="Old Paper",
            doi="10.9999/old",
            source="manual",
        )
        db.add(existing)
        await db.commit()

    async def mock_search(self, query="", sources=None, max_results=100):
        return {
            "papers": [
                {
                    "title": "Old Paper Copy",
                    "doi": "10.9999/old",
                    "abstract": "Dup",
                    "year": 2024,
                    "journal": "",
                    "source": "search",
                    "pdf_url": "",
                }
            ],
            "total": 1,
        }

    from app.services import search_service

    monkeypatch.setattr(search_service.SearchService, "search", mock_search)

    saver = MemorySaver()
    graph = create_search_pipeline(checkpointer=saver)
    config = {"configurable": {"thread_id": "test_resume"}}

    initial: PipelineState = {
        "project_id": project.id,
        "thread_id": "test_resume",
        "pipeline_type": "search",
        "params": {"query": "old", "max_results": 10},
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

    await graph.ainvoke(initial, config=config)

    snapshot = graph.get_state(config)
    assert "hitl_dedup" in snapshot.next, f"Expected interrupt, got {snapshot.next}"

    result = await graph.ainvoke(
        Command(resume=[{"action": "skip", "new_paper": {}}]),
        config=config,
    )

    assert result["progress"] == 100
    assert result["stage"] == "index"


# ── Upload pipeline with no conflicts ──


async def test_upload_pipeline_no_files(project):
    """Upload pipeline with no PDF paths produces empty result."""
    saver = MemorySaver()
    graph = create_upload_pipeline(checkpointer=saver)

    initial: PipelineState = {
        "project_id": project.id,
        "thread_id": "test_upload_empty",
        "pipeline_type": "upload",
        "params": {"pdf_paths": []},
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

    config = {"configurable": {"thread_id": "test_upload_empty"}}
    result = await graph.ainvoke(initial, config=config)
    assert result["progress"] == 100


# ── Checkpoint persistence ──


async def test_checkpoint_persists(project, monkeypatch):
    """Graph state should persist across get_state calls."""

    async def mock_search(self, query="", sources=None, max_results=100):
        return {"papers": [], "total": 0}

    from app.services import search_service

    monkeypatch.setattr(search_service.SearchService, "search", mock_search)

    saver = MemorySaver()
    graph = create_search_pipeline(checkpointer=saver)

    initial: PipelineState = {
        "project_id": project.id,
        "thread_id": "test_ckpt",
        "pipeline_type": "search",
        "params": {"query": "ckpt", "max_results": 5},
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

    config = {"configurable": {"thread_id": "test_ckpt"}}
    await graph.ainvoke(initial, config=config)

    snapshot = graph.get_state(config)
    assert snapshot is not None
    assert snapshot.values.get("progress") == 100


# ── Pipeline API endpoint tests ──


@pytest.fixture
def test_client():
    """Create test client for API tests."""
    from httpx import ASGITransport, AsyncClient

    from app.main import app

    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def test_pipeline_search_api(test_client, project, monkeypatch):
    """POST /api/v1/pipelines/search should return thread_id."""

    async def mock_search(self, query="", sources=None, max_results=100):
        return {"papers": [], "total": 0}

    from app.services import search_service

    monkeypatch.setattr(search_service.SearchService, "search", mock_search)

    async with test_client as client:
        resp = await client.post(
            "/api/v1/pipelines/search",
            json={
                "project_id": project.id,
                "query": "machine learning",
                "max_results": 10,
            },
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert "thread_id" in data
        assert data["status"] == "running"

        thread_id = data["thread_id"]

        # Get status immediately before pipeline completes and removes itself
        resp2 = await client.get(f"/api/v1/pipelines/{thread_id}/status")
        assert resp2.status_code == 200


async def test_pipeline_status_404(test_client, project):
    """GET status for nonexistent pipeline returns 404."""
    async with test_client as client:
        resp = await client.get("/api/v1/pipelines/nonexistent/status")
        assert resp.status_code == 404


async def test_pipeline_cancel(test_client, project, monkeypatch):
    """POST cancel should mark pipeline as cancelled."""

    async def mock_search(self, query="", sources=None, max_results=100):
        import asyncio

        await asyncio.sleep(10)
        return {"papers": [], "total": 0}

    from app.services import search_service

    monkeypatch.setattr(search_service.SearchService, "search", mock_search)

    async with test_client as client:
        resp = await client.post(
            "/api/v1/pipelines/search",
            json={
                "project_id": project.id,
                "query": "test",
                "max_results": 5,
            },
        )
        thread_id = resp.json()["data"]["thread_id"]

        resp2 = await client.post(f"/api/v1/pipelines/{thread_id}/cancel")
        assert resp2.status_code == 200
        assert resp2.json()["data"]["status"] == "cancelled"
