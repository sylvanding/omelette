"""Tests for knowledge base management: alias routes, PDF upload, dedup resolve."""

import io

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import Base, engine
from app.main import app


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
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture
async def project(client: AsyncClient) -> dict:
    resp = await client.post("/api/v1/projects", json={"name": "KB Test"})
    return resp.json()["data"]


# --- PDF Upload ---


@pytest.mark.asyncio
async def test_upload_pdf_minimal(client: AsyncClient, project: dict):
    """Upload a minimal valid PDF."""
    pdf_bytes = _make_minimal_pdf()
    resp = await client.post(
        f"/api/v1/projects/{project['id']}/papers/upload",
        files=[("files", ("test.pdf", io.BytesIO(pdf_bytes), "application/pdf"))],
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["total_uploaded"] == 1


# --- Dedup Resolve ---


@pytest.mark.asyncio
async def test_dedup_resolve_invalid_conflict(client: AsyncClient, project: dict):
    """Resolve with nonexistent paper returns 404."""
    resp = await client.post(
        f"/api/v1/projects/{project['id']}/dedup/resolve",
        json={"conflict_id": "999:nonexistent.pdf", "action": "keep_old"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_dedup_resolve_keep_old(client: AsyncClient, project: dict):
    """Resolve keep_old with an existing paper should succeed."""
    paper_resp = await client.post(
        f"/api/v1/projects/{project['id']}/papers",
        json={"title": "Test Paper"},
    )
    paper_id = paper_resp.json()["data"]["id"]
    resp = await client.post(
        f"/api/v1/projects/{project['id']}/dedup/resolve",
        json={"conflict_id": f"{paper_id}:dummy.pdf", "action": "keep_old"},
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["action"] == "keep_old"


@pytest.mark.asyncio
async def test_dedup_auto_resolve_empty(client: AsyncClient, project: dict):
    resp = await client.post(
        f"/api/v1/projects/{project['id']}/dedup/auto-resolve",
        json={"conflict_ids": []},
    )
    assert resp.status_code == 200


def _make_minimal_pdf() -> bytes:
    """Create a minimal valid PDF in memory."""
    return b"""%PDF-1.0
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
trailer<</Size 4/Root 1 0 R>>
startxref
206
%%EOF"""
