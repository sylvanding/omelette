"""End-to-end pipeline tests for core user flows.

Uses httpx AsyncClient via ASGITransport against FastAPI app.
LLM calls are mocked via LLM_PROVIDER=mock (set in conftest.py).
"""

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
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_project_paper_query_flow(client: AsyncClient):
    """Project creation → paper upload (manual create) → list papers."""
    # 1. Create project
    resp = await client.post(
        "/api/v1/projects",
        json={"name": "Test Project", "description": "E2E test"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["code"] == 201
    project_id = body["data"]["id"]

    # 2. Upload paper (manual create, simulate import)
    resp = await client.post(
        f"/api/v1/projects/{project_id}/papers",
        json={
            "title": "Test Paper",
            "abstract": "This is a test abstract about machine learning.",
            "authors": [{"name": "Author A"}],
            "year": 2024,
            "doi": "10.1234/test.2024",
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["data"]["title"] == "Test Paper"
    assert body["data"]["doi"] == "10.1234/test.2024"

    # 3. List papers
    resp = await client.get(f"/api/v1/projects/{project_id}/papers")
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 200
    data = body["data"]
    assert data["total"] == 1
    assert len(data["items"]) == 1
    assert data["items"][0]["title"] == "Test Paper"


@pytest.mark.asyncio
async def test_writing_summarize_flow(client: AsyncClient):
    """Create project + papers → call summarize API → verify response."""
    # 1. Create project
    resp = await client.post(
        "/api/v1/projects",
        json={"name": "Writing E2E Project", "description": "E2E writing test"},
    )
    assert resp.status_code == 201
    project_id = resp.json()["data"]["id"]

    # 2. Create papers
    papers_payload = [
        {
            "title": "Paper A: Deep Learning",
            "abstract": "A survey of deep learning methods.",
            "authors": [{"name": "Alice"}],
            "year": 2024,
        },
        {
            "title": "Paper B: Neural Networks",
            "abstract": "Introduction to neural network architectures.",
            "authors": [{"name": "Bob"}],
            "year": 2023,
        },
    ]
    paper_ids = []
    for p in papers_payload:
        resp = await client.post(f"/api/v1/projects/{project_id}/papers", json=p)
        assert resp.status_code == 201
        paper_ids.append(resp.json()["data"]["id"])

    # 3. Call summarize API
    resp = await client.post(
        f"/api/v1/projects/{project_id}/writing/summarize",
        json={"paper_ids": paper_ids, "language": "en"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 200
    assert "summaries" in body["data"]
    assert len(body["data"]["summaries"]) == 2
    for s in body["data"]["summaries"]:
        assert "paper_id" in s
        assert "title" in s
        assert "summary" in s
