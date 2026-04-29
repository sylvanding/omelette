"""Tests for pipeline node implementations, focusing on parallel OCR processing."""

import asyncio
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import select

from app.database import Base, engine
from app.models import Paper, PaperStatus, Project
from app.pipelines.nodes import _process_paper_ocr, ocr_node


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
        p = Project(name="test-nodes", description="test")
        db.add(p)
        await db.commit()
        await db.refresh(p)
        return p


def _make_paper(paper_num, project_id, status=PaperStatus.PDF_DOWNLOADED, pdf_path="/fake/path.pdf"):
    return Paper(
        project_id=project_id,
        title=f"Paper {paper_num}",
        source="test",
        status=status,
        pdf_path=pdf_path,
    )


async def _get_paper(db, paper_id):
    return (await db.execute(select(Paper).where(Paper.id == paper_id))).scalar_one()


async def _get_papers(db, project_id):
    return (await db.execute(select(Paper).where(Paper.project_id == project_id))).scalars().all()


def create_state(project_id, thread_id, cancelled=False):
    return {
        "project_id": project_id,
        "thread_id": thread_id,
        "papers": [],
        "conflicts": [],
        "resolved_conflicts": [],
        "progress": 0,
        "total": 100,
        "stage": "ocr",
        "error": None,
        "cancelled": cancelled,
        "result": {},
    }


def patch_ocr(mock_ocr):
    """Patch OCRService so that OCRService(...) returns the given mock instance."""
    return patch("app.services.ocr_service.OCRService", side_effect=lambda *a, **kw: mock_ocr)


class MockOCRService:
    """Lightweight mock for OCRService that supports async context manager."""

    def __init__(self, default_return=None, path_overrides=None, chunk_return=None):
        self.default_return = default_return or {
            "method": "pdfplumber",
            "pages": [{"page_number": 1, "text": "Test content", "has_text": True}],
        }
        self.path_overrides = path_overrides or {}
        self.chunk_return = chunk_return or [
            {"content": "Test chunk", "page_number": 1, "chunk_index": 0, "token_count": 3}
        ]

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        pass

    async def process_pdf_async(self, pdf_path, **kw):
        for prefix, ret in self.path_overrides.items():
            if prefix in pdf_path:
                return ret
        return self.default_return

    def chunk_text(self, pages, **kw):
        return self.chunk_return

    def chunk_mineru_markdown(self, content, **kw):
        return self.chunk_return

    def close(self):
        pass


# ── ocr_node: early exit with no papers ──


async def test_ocr_node_no_papers(project):
    """ocr_node should return early when no papers need OCR."""
    state = create_state(project.id, "test_no_papers")
    result = await ocr_node(state)
    assert result["stage"] == "ocr"
    assert result["result"]["ocr_processed"] == 0


# ── ocr_node: single paper success ──


async def test_ocr_node_single_paper(project):
    """ocr_node should process a single paper successfully."""
    from app.database import async_session_factory

    async with async_session_factory() as db:
        paper = _make_paper(1, project.id)
        db.add(paper)
        await db.commit()
        await db.refresh(paper)
        paper_id = paper.id

    mock_ocr = MockOCRService()

    with patch_ocr(mock_ocr):
        result = await ocr_node(state=create_state(project.id, "test_single"))

    assert result["result"]["ocr_processed"] == 1

    async with async_session_factory() as db:
        p = await _get_paper(db, paper_id)
        assert p.status == PaperStatus.OCR_COMPLETE


# ── ocr_node: parallel processing of multiple papers ──


async def test_ocr_node_parallel_processing(project):
    """ocr_node should process multiple papers concurrently."""
    from app.database import async_session_factory

    async with async_session_factory() as db:
        for i in range(3):
            db.add(_make_paper(i + 1, project.id, pdf_path=f"/fake/path_{i}.pdf"))
        await db.commit()

    mock_ocr = MockOCRService()

    with patch_ocr(mock_ocr):
        result = await ocr_node(state=create_state(project.id, "test_parallel"))

    assert result["result"]["ocr_processed"] == 3

    async with async_session_factory() as db:
        papers = await _get_papers(db, project.id)
        for p in papers:
            assert p.status == PaperStatus.OCR_COMPLETE


# ── ocr_node: single failure doesn't crash batch ──


async def test_ocr_node_single_failure_doesnt_crash_batch(project):
    """A single PDF failure should not crash the entire batch."""
    from app.database import async_session_factory

    async with async_session_factory() as db:
        db.add(_make_paper(1, project.id, pdf_path="/fake/good_1.pdf"))
        db.add(_make_paper(2, project.id, pdf_path="/fake/bad.pdf"))
        db.add(_make_paper(3, project.id, pdf_path="/fake/good_2.pdf"))
        await db.commit()

    mock_ocr = MockOCRService(
        default_return={
            "method": "pdfplumber",
            "pages": [{"page_number": 1, "text": "Good content", "has_text": True}],
        },
        path_overrides={
            "bad": {"error": "PDF is corrupted"},
        },
    )

    with patch_ocr(mock_ocr):
        result = await ocr_node(state=create_state(project.id, "test_partial_failure"))

    assert result["result"]["ocr_processed"] == 2

    async with async_session_factory() as db:
        papers = sorted(await _get_papers(db, project.id), key=lambda p: p.pdf_path)
        assert papers[0].status == PaperStatus.ERROR  # bad.pdf
        assert papers[1].status == PaperStatus.OCR_COMPLETE  # good_1.pdf
        assert papers[2].status == PaperStatus.OCR_COMPLETE  # good_2.pdf


# ── ocr_node: respects parallel limit via semaphore ──


async def test_ocr_node_respects_parallel_limit(project, monkeypatch):
    """Semaphore should limit concurrent OCR tasks."""
    from app.config import settings

    monkeypatch.setattr(settings, "ocr_parallel_limit", 2)

    from app.database import async_session_factory

    async with async_session_factory() as db:
        for i in range(4):
            db.add(_make_paper(i + 1, project.id, pdf_path=f"/fake/path_{i}.pdf"))
        await db.commit()

    max_concurrent = 0
    current_concurrent = 0
    lock = asyncio.Lock()

    async def mock_process_pdf(pdf_path, **kwargs):
        nonlocal max_concurrent, current_concurrent
        async with lock:
            current_concurrent += 1
            max_concurrent = max(max_concurrent, current_concurrent)
        await asyncio.sleep(0.05)
        async with lock:
            current_concurrent -= 1
        return {
            "method": "pdfplumber",
            "pages": [{"page_number": 1, "text": "Content", "has_text": True}],
        }

    mock_ocr = MockOCRService(chunk_return=[{"content": "chunk", "page_number": 1, "chunk_index": 0, "token_count": 1}])
    mock_ocr.process_pdf_async = mock_process_pdf

    with patch_ocr(mock_ocr):
        result = await ocr_node(state=create_state(project.id, "test_semaphore"))

    assert result["result"]["ocr_processed"] == 4
    assert max_concurrent <= 2


# ── ocr_node: cancelled state ──


async def test_ocr_node_cancelled_before_start(project):
    """ocr_node should return cancelled when state is already cancelled."""
    state = create_state(project.id, "test_cancelled", cancelled=True)
    result = await ocr_node(state)
    assert result["cancelled"] is True


# ── ocr_node: OCR error result marks paper as ERROR ──


async def test_ocr_node_ocr_error_marks_paper(project):
    """When OCR returns an error, the paper should be marked as ERROR."""
    from app.database import async_session_factory

    async with async_session_factory() as db:
        paper = _make_paper(1, project.id)
        db.add(paper)
        await db.commit()
        await db.refresh(paper)
        paper_id = paper.id

    mock_ocr = MockOCRService(default_return={"error": "OCR engine failed", "method": "pdfplumber"})

    with patch_ocr(mock_ocr):
        result = await ocr_node(state=create_state(project.id, "test_ocr_error"))

    assert result["result"]["ocr_processed"] == 0

    async with async_session_factory() as db:
        p = await _get_paper(db, paper_id)
        assert p.status == PaperStatus.ERROR


# ── _process_paper_ocr: unit tests ──


async def test_process_paper_ocr_success():
    """_process_paper_ocr should return chunks on success."""
    paper = MagicMock()
    paper.pdf_path = "/fake/test.pdf"
    paper.id = 42

    mock_ocr = MockOCRService()
    semaphore = asyncio.Semaphore(1)
    state = create_state(1, "test_unit")

    result = await _process_paper_ocr(paper, mock_ocr, semaphore, state)
    assert len(result["chunks"]) == 1
    assert result["chunks"][0]["content"] == "Test chunk"


async def test_process_paper_ocr_cancelled():
    """_process_paper_ocr should return error when cancelled."""
    paper = MagicMock()
    paper.id = 42

    mock_ocr = MagicMock()
    semaphore = asyncio.Semaphore(1)
    state = create_state(1, "test_cancel", cancelled=True)

    result = await _process_paper_ocr(paper, mock_ocr, semaphore, state)
    assert result["error"] == "cancelled"
    assert result["chunks"] == []
