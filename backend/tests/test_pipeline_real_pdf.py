"""Pipeline integration tests with real PDF files.

Requires test PDFs at /data0/djx/omelette_pdf_test/ (skipped otherwise).
These tests exercise the upload pipeline with real metadata extraction.
"""

import os
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import Command

from app.database import Base, async_session_factory, engine
from app.models import Paper, Project
from app.pipelines.graphs import create_upload_pipeline
from app.pipelines.state import PipelineState

PDF_TEST_DIR = os.environ.get("E2E_PDF_DIR", "/data0/djx/omelette_pdf_test")
PDF_DIR_EXISTS = os.path.isdir(PDF_TEST_DIR)

pytestmark = pytest.mark.skipif(not PDF_DIR_EXISTS, reason=f"Test PDF directory not available: {PDF_TEST_DIR}")


def _smallest_pdf() -> str:
    """Find the smallest PDF in the test directory."""
    pdfs = sorted(Path(PDF_TEST_DIR).glob("*.pdf"), key=lambda p: p.stat().st_size)
    if not pdfs:
        pytest.skip("No PDFs found in test directory")
    return str(pdfs[0])


@pytest.fixture(autouse=True)
async def setup_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def project():
    async with async_session_factory() as db:
        p = Project(name="pdf-test-kb", description="for real PDF testing")
        db.add(p)
        await db.commit()
        await db.refresh(p)
        return p


@pytest.fixture
def test_client():
    from app.main import app

    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


# ── Upload pipeline with real PDF ──


async def test_upload_pipeline_real_pdf(project):
    """Upload pipeline with a real PDF should extract metadata and import the paper."""
    pdf_path = _smallest_pdf()

    saver = MemorySaver()
    graph = create_upload_pipeline(checkpointer=saver)

    initial: PipelineState = {
        "project_id": project.id,
        "thread_id": "test_upload_real",
        "pipeline_type": "upload",
        "params": {"pdf_paths": [pdf_path]},
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

    config = {"configurable": {"thread_id": "test_upload_real"}}
    result = await graph.ainvoke(initial, config=config)

    assert result["progress"] == 100
    assert result.get("error") is None

    papers = result.get("papers", [])
    assert len(papers) >= 1
    first = papers[0]
    assert first.get("title"), "Extracted title should not be empty"


# ── HITL interrupt → resume flow ──


async def test_upload_hitl_interrupt_resume(project):
    """When an uploaded PDF has the same title as an existing paper,
    the dedup node should trigger HITL. Resuming with 'skip' should complete."""
    pdf_path = _smallest_pdf()

    from app.services.pdf_metadata import extract_metadata

    meta = await extract_metadata(Path(pdf_path), fallback_title="fallback")

    async with async_session_factory() as db:
        existing = Paper(
            project_id=project.id,
            title=meta.title,
            doi=meta.doi or "",
            source="manual",
        )
        db.add(existing)
        await db.commit()

    saver = MemorySaver()
    graph = create_upload_pipeline(checkpointer=saver)

    initial: PipelineState = {
        "project_id": project.id,
        "thread_id": "test_hitl_resume",
        "pipeline_type": "upload",
        "params": {"pdf_paths": [pdf_path]},
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

    config = {"configurable": {"thread_id": "test_hitl_resume"}}
    await graph.ainvoke(initial, config=config)

    snapshot = graph.get_state(config)
    assert "hitl_dedup" in snapshot.next, f"Expected HITL interrupt, got {snapshot.next}"
    conflicts = snapshot.values.get("conflicts", [])
    assert len(conflicts) >= 1

    result = await graph.ainvoke(
        Command(resume=[{"action": "skip", "new_paper": {}}]),
        config=config,
    )
    assert result["progress"] == 100
    assert result["stage"] in ("index", "import")


# ── Pipeline API path safety ──


async def test_pipeline_path_traversal_rejected(test_client, project):
    """Paths outside pdf_dir should be rejected with 400."""
    resp = await test_client.post(
        "/api/v1/pipelines/upload",
        json={
            "project_id": project.id,
            "pdf_paths": ["/etc/passwd"],
        },
    )
    assert resp.status_code == 400
    assert "not within allowed directory" in resp.json().get("message", "")


async def test_pipeline_path_dot_dot_rejected(test_client, project):
    """Paths with '..' that resolve outside pdf_dir should be rejected."""
    resp = await test_client.post(
        "/api/v1/pipelines/upload",
        json={
            "project_id": project.id,
            "pdf_paths": [f"{PDF_TEST_DIR}/../../etc/passwd"],
        },
    )
    assert resp.status_code == 400


# ── Pipeline list endpoint ──


async def test_pipeline_list_includes_started(test_client, project, monkeypatch):
    """After starting a pipeline, GET /pipelines should list it."""
    from app.api.v1 import pipelines

    pipelines._running_tasks.clear()

    async def mock_search(self, query="", sources=None, max_results=100):
        return {"papers": [], "total": 0}

    from app.services import search_service

    monkeypatch.setattr(search_service.SearchService, "search", mock_search)

    resp = await test_client.post(
        "/api/v1/pipelines/search",
        json={
            "project_id": project.id,
            "query": "test",
            "max_results": 5,
        },
    )
    assert resp.status_code == 200

    import asyncio

    await asyncio.sleep(0.5)

    list_resp = await test_client.get("/api/v1/pipelines")
    assert list_resp.status_code == 200
    data = list_resp.json()["data"]
    assert len(data) >= 1

    pipelines._running_tasks.clear()
