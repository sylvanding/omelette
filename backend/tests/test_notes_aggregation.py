"""Tests for aggregated notes endpoint."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import Base, engine
from app.main import app


@pytest.fixture(autouse=True)
async def setup_db():
    """Create tables before each test, drop after."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def client():
    """Async HTTP client for in-process testing."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def project_id(client: AsyncClient) -> int:
    """Create a project and return its ID."""
    resp = await client.post("/api/v1/projects", json={"name": "Test Project"})
    return resp.json()["data"]["id"]


async def create_paper(client: AsyncClient, project_id: int, title: str, notes: str = ""):
    """Create a paper and return its ID."""
    resp = await client.post(
        f"/api/v1/projects/{project_id}/papers",
        json={
            "title": title,
            "doi": f"10.1234/{title.replace(' ', '')}",
            "notes": notes,
        },
    )
    return resp.json()["data"]["id"]


@pytest.mark.asyncio
async def test_aggregate_notes_empty_project(client: AsyncClient, project_id: int):
    """Returns zero counts for project with no papers."""
    resp = await client.get(f"/api/v1/projects/{project_id}/papers/notes/aggregate")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["total_papers"] == 0
    assert data["papers_with_notes"] == 0
    assert data["notes"] == []


@pytest.mark.asyncio
async def test_aggregate_notes_papers_without_notes(client: AsyncClient, project_id: int):
    """Papers without notes are counted in total but not in papers_with_notes."""
    await create_paper(client, project_id, "Paper Without Notes")
    resp = await client.get(f"/api/v1/projects/{project_id}/papers/notes/aggregate")
    data = resp.json()["data"]
    assert data["total_papers"] == 1
    assert data["papers_with_notes"] == 0
    assert data["notes"] == []


@pytest.mark.asyncio
async def test_aggregate_notes_papers_with_notes(client: AsyncClient, project_id: int):
    """Papers with notes appear in the aggregation results."""
    await create_paper(client, project_id, "Paper With Notes", notes="This is an important finding.")
    resp = await client.get(f"/api/v1/projects/{project_id}/papers/notes/aggregate")
    data = resp.json()["data"]
    assert data["total_papers"] == 1
    assert data["papers_with_notes"] == 1
    assert len(data["notes"]) == 1
    assert data["notes"][0]["title"] == "Paper With Notes"
    assert "important finding" in data["notes"][0]["notes"]


@pytest.mark.asyncio
async def test_aggregate_notes_search_filter(client: AsyncClient, project_id: int):
    """Search parameter filters notes by content."""
    await create_paper(client, project_id, "ML Paper", notes="Machine learning approach")
    await create_paper(client, project_id, "Bio Paper", notes="Biological synthesis method")
    resp = await client.get(
        f"/api/v1/projects/{project_id}/papers/notes/aggregate",
        params={"search": "machine"},
    )
    data = resp.json()["data"]
    assert data["papers_with_notes"] == 1
    assert data["notes"][0]["title"] == "ML Paper"


@pytest.mark.asyncio
async def test_aggregate_notes_multiple_papers(client: AsyncClient, project_id: int):
    """Multiple papers with notes are all aggregated."""
    await create_paper(client, project_id, "First Paper", notes="Note one")
    await create_paper(client, project_id, "Second Paper", notes="Note two")
    await create_paper(client, project_id, "Third Paper", notes="")
    resp = await client.get(f"/api/v1/projects/{project_id}/papers/notes/aggregate")
    data = resp.json()["data"]
    assert data["total_papers"] == 3
    assert data["papers_with_notes"] == 2
    assert data["total_notes"] > 0
