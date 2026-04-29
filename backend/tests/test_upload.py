"""Tests for PDF upload endpoint — content hash deduplication."""

import hashlib
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.database import Base, async_session_factory, engine
from app.main import app
from app.models import Paper
from app.schemas.knowledge_base import NewPaperData


@pytest.fixture(autouse=True)
async def setup_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


def _make_pdf(content=b"fake pdf content"):
    """Create an in-memory PDF-like file for upload."""
    return ("test.pdf", content, "application/pdf")


def _mock_metadata(**overrides):
    """Create an AsyncMock that returns NewPaperData when awaited."""
    defaults = dict(
        title="Test Paper",
        abstract="",
        authors=[],
        doi=None,
        year=2024,
        journal="",
        source="upload",
    )
    defaults.update(overrides)
    return AsyncMock(return_value=NewPaperData(**defaults))


@pytest.mark.asyncio
async def test_upload_stores_content_hash(client: AsyncClient):
    """Verify that uploading a PDF stores its SHA-256 hash."""
    create_resp = await client.post("/api/v1/projects", json={"name": "Hash Test"})
    assert create_resp.status_code == 201
    project_id = create_resp.json()["data"]["id"]

    pdf_content = b"%PDF-1.4 test document content"
    expected_hash = hashlib.sha256(pdf_content).hexdigest()

    with (
        patch("app.api.v1.upload.extract_metadata", _mock_metadata(title="Test Paper")),
        patch("app.api.v1.upload.process_papers_background", AsyncMock()),
    ):
        resp = await client.post(
            f"/api/v1/projects/{project_id}/papers/upload",
            files={"files": _make_pdf(pdf_content)},
        )

    assert resp.status_code == 200

    async with async_session_factory() as session:
        result = await session.execute(select(Paper).where(Paper.project_id == project_id))
        paper = result.scalar_one()
        assert paper.content_hash == expected_hash


@pytest.mark.asyncio
async def test_upload_rejects_duplicate_content(client: AsyncClient):
    """Uploading the same PDF twice should return 409 conflict."""
    create_resp = await client.post("/api/v1/projects", json={"name": "Dup Test"})
    assert create_resp.status_code == 201
    project_id = create_resp.json()["data"]["id"]

    pdf_content = b"%PDF-1.4 duplicate content"

    with (
        patch("app.api.v1.upload.extract_metadata", _mock_metadata(title="First Upload")),
        patch("app.api.v1.upload.process_papers_background", AsyncMock()),
    ):
        resp = await client.post(
            f"/api/v1/projects/{project_id}/papers/upload",
            files={"files": _make_pdf(pdf_content)},
        )
        assert resp.status_code == 200

        resp = await client.post(
            f"/api/v1/projects/{project_id}/papers/upload",
            files={"files": _make_pdf(pdf_content)},
        )

    assert resp.status_code == 409
    body = resp.json()
    assert "duplicate" in body["message"].lower()
    assert "First Upload" in body["message"]


@pytest.mark.asyncio
async def test_upload_different_files_with_same_title_passes(client: AsyncClient):
    """Different PDF content but same title should NOT be rejected by content hash."""
    create_resp = await client.post("/api/v1/projects", json={"name": "Same Title Test"})
    assert create_resp.status_code == 201
    project_id = create_resp.json()["data"]["id"]

    with patch("app.api.v1.upload.extract_metadata", _mock_metadata(title="Same Title Paper")):
        resp = await client.post(
            f"/api/v1/projects/{project_id}/papers/upload",
            files={"files": _make_pdf(b"%PDF-1.4 content version A")},
        )
        assert resp.status_code == 200

        resp = await client.post(
            f"/api/v1/projects/{project_id}/papers/upload",
            files={"files": _make_pdf(b"%PDF-1.4 content version B completely different")},
        )
        assert resp.status_code == 200


@pytest.mark.asyncio
async def test_upload_different_projects_can_have_same_content(client: AsyncClient):
    """Content hash dedup is per-project — same PDF in different projects should be allowed."""
    resp_a = await client.post("/api/v1/projects", json={"name": "Project A"})
    resp_b = await client.post("/api/v1/projects", json={"name": "Project B"})
    project_a = resp_a.json()["data"]["id"]
    project_b = resp_b.json()["data"]["id"]

    pdf_content = b"%PDF-1.4 shared content"

    with patch("app.api.v1.upload.extract_metadata", _mock_metadata(title="Shared Paper")):
        resp = await client.post(
            f"/api/v1/projects/{project_a}/papers/upload",
            files={"files": _make_pdf(pdf_content)},
        )
        assert resp.status_code == 200

        resp = await client.post(
            f"/api/v1/projects/{project_b}/papers/upload",
            files={"files": _make_pdf(pdf_content)},
        )
        assert resp.status_code == 200
