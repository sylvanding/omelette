"""End-to-end integration test simulating the full Omelette workflow."""

import pytest
from conftest import remove_paper_doi_unique_constraint
from httpx import ASGITransport, AsyncClient

from app.database import Base, engine
from app.main import app


@pytest.fixture(autouse=True)
async def setup_db():
    remove_paper_doi_unique_constraint()
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
async def test_full_workflow(client: AsyncClient):
    """Simulate full workflow: create project → keywords → search formula → papers → dedup → stats."""
    # 1. Create project
    resp = await client.post(
        "/api/v1/projects",
        json={
            "name": "Super-Resolution Microscopy Review",
            "description": "Systematic review of SRM techniques",
            "domain": "optical_microscopy",
        },
    )
    assert resp.status_code == 201
    project_id = resp.json()["data"]["id"]

    # 2. Add keywords
    keywords = [
        {"term": "超分辨率显微", "term_en": "super-resolution microscopy", "level": 1, "category": "core"},
        {"term": "STED", "term_en": "STED microscopy", "level": 2, "category": "technique"},
        {"term": "STORM", "term_en": "STORM imaging", "level": 2, "category": "technique"},
        {"term": "PALM", "term_en": "PALM microscopy", "level": 2, "category": "technique"},
        {"term": "结构光照明", "term_en": "structured illumination", "level": 3, "category": "method"},
    ]
    for kw in keywords:
        resp = await client.post(f"/api/v1/projects/{project_id}/keywords", json=kw)
        assert resp.status_code == 201

    # 3. Get search formula
    resp = await client.get(f"/api/v1/projects/{project_id}/keywords/search-formula?database=wos")
    assert resp.status_code == 200
    assert "TS=" in resp.json()["data"]["formula"]

    # 4. Create papers
    papers = [
        {
            "title": "STED Microscopy Advances in 2025",
            "doi": "10.1234/sted2025",
            "year": 2025,
            "journal": "Nature Photonics",
            "citation_count": 50,
        },
        {
            "title": "STED Microscopy Advances in 2025",
            "doi": "10.1234/sted2025",
            "year": 2025,
            "journal": "Nature Photonics",
        },  # duplicate DOI
        {
            "title": "STORM Imaging for Live Cells",
            "doi": "10.5678/storm2024",
            "year": 2024,
            "journal": "Science",
            "citation_count": 120,
        },
        {"title": "PALM Single Molecule Localization", "year": 2023, "journal": "PNAS"},
    ]
    for p in papers:
        await client.post(f"/api/v1/projects/{project_id}/papers", json=p)

    # 5. Run dedup
    resp = await client.post(
        f"/api/v1/projects/{project_id}/dedup/run",
        params={"strategy": "doi_only"},
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["removed"] == 1

    # 6. List papers after dedup
    resp = await client.get(f"/api/v1/projects/{project_id}/papers")
    assert resp.status_code == 200
    assert resp.json()["data"]["total"] == 3

    # 7. Check project
    resp = await client.get(f"/api/v1/projects/{project_id}")
    assert resp.status_code == 200
    assert resp.json()["data"]["paper_count"] == 3
    assert resp.json()["data"]["keyword_count"] == 5

    # 8. Health check
    resp = await client.get("/api/v1/settings/health")
    assert resp.status_code == 200
    assert resp.json()["data"]["status"] == "healthy"
