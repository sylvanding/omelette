"""Tests for Keyword CRUD API endpoints and KeywordService."""

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


@pytest.fixture
async def project_id(client: AsyncClient) -> int:
    """Create a project and return its ID for keyword tests."""
    resp = await client.post("/api/v1/projects", json={"name": "Test Project", "domain": "optics"})
    assert resp.status_code == 201
    return resp.json()["data"]["id"]


@pytest.mark.asyncio
async def test_create_keyword(client: AsyncClient, project_id: int):
    resp = await client.post(
        f"/api/v1/projects/{project_id}/keywords",
        json={
            "term": "超分辨率显微",
            "term_en": "super-resolution microscopy",
            "level": 1,
            "category": "technique",
            "synonyms": "SRM, nanoscopy",
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["code"] == 201
    assert body["data"]["term"] == "超分辨率显微"
    assert body["data"]["term_en"] == "super-resolution microscopy"
    assert body["data"]["level"] == 1
    assert body["data"]["id"] > 0


@pytest.mark.asyncio
async def test_list_keywords_empty(client: AsyncClient, project_id: int):
    resp = await client.get(f"/api/v1/projects/{project_id}/keywords")
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 200
    assert body["data"]["items"] == []
    assert body["data"]["total"] == 0


@pytest.mark.asyncio
async def test_list_keywords_by_level(client: AsyncClient, project_id: int):
    await client.post(
        f"/api/v1/projects/{project_id}/keywords",
        json={"term": "Core Term", "term_en": "core", "level": 1},
    )
    await client.post(
        f"/api/v1/projects/{project_id}/keywords",
        json={"term": "Sub Term", "term_en": "sub", "level": 2},
    )
    await client.post(
        f"/api/v1/projects/{project_id}/keywords",
        json={"term": "Another Core", "term_en": "core2", "level": 1},
    )

    resp = await client.get(f"/api/v1/projects/{project_id}/keywords?level=1")
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 200
    assert len(body["data"]["items"]) == 2
    assert all(k["level"] == 1 for k in body["data"]["items"])


@pytest.mark.asyncio
async def test_update_keyword(client: AsyncClient, project_id: int):
    create_resp = await client.post(
        f"/api/v1/projects/{project_id}/keywords",
        json={"term": "Original", "term_en": "original", "level": 1},
    )
    keyword_id = create_resp.json()["data"]["id"]

    resp = await client.put(
        f"/api/v1/projects/{project_id}/keywords/{keyword_id}",
        json={"term": "Updated", "term_en": "updated"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["term"] == "Updated"
    assert body["data"]["term_en"] == "updated"


@pytest.mark.asyncio
async def test_delete_keyword(client: AsyncClient, project_id: int):
    create_resp = await client.post(
        f"/api/v1/projects/{project_id}/keywords",
        json={"term": "To Delete", "term_en": "delete", "level": 1},
    )
    keyword_id = create_resp.json()["data"]["id"]

    resp = await client.delete(f"/api/v1/projects/{project_id}/keywords/{keyword_id}")
    assert resp.status_code == 200

    list_resp = await client.get(f"/api/v1/projects/{project_id}/keywords")
    assert len(list_resp.json()["data"]["items"]) == 0


@pytest.mark.asyncio
async def test_bulk_create_keywords(client: AsyncClient, project_id: int):
    keywords = [
        {"term": "Term 1", "term_en": "term1", "level": 1},
        {"term": "Term 2", "term_en": "term2", "level": 2},
        {"term": "Term 3", "term_en": "term3", "level": 3},
    ]
    resp = await client.post(f"/api/v1/projects/{project_id}/keywords/bulk", json=keywords)
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["created"] == 3

    list_resp = await client.get(f"/api/v1/projects/{project_id}/keywords")
    assert len(list_resp.json()["data"]["items"]) == 3


@pytest.mark.asyncio
async def test_generate_search_formula_empty(client: AsyncClient, project_id: int):
    resp = await client.get(f"/api/v1/projects/{project_id}/keywords/search-formula?database=wos")
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["formula"] == ""
    assert body["data"]["database"] == "wos"
    assert body["data"]["keyword_count"] == 0


@pytest.mark.asyncio
async def test_generate_search_formula_wos(client: AsyncClient, project_id: int):
    await client.post(
        f"/api/v1/projects/{project_id}/keywords",
        json={
            "term": "超分辨率",
            "term_en": "super-resolution",
            "level": 1,
            "synonyms": "SRM, nanoscopy",
        },
    )
    await client.post(
        f"/api/v1/projects/{project_id}/keywords",
        json={"term": "STED", "term_en": "STED", "level": 2, "synonyms": "STED microscopy"},
    )

    resp = await client.get(f"/api/v1/projects/{project_id}/keywords/search-formula?database=wos")
    assert resp.status_code == 200
    body = resp.json()
    assert "super-resolution" in body["data"]["formula"]
    assert "STED" in body["data"]["formula"]
    assert body["data"]["database"] == "wos"
    assert body["data"]["keyword_count"] == 2
    assert "core_terms" in body["data"]
    assert "sub_terms" in body["data"]


@pytest.mark.asyncio
async def test_generate_search_formula_scopus(client: AsyncClient, project_id: int):
    await client.post(
        f"/api/v1/projects/{project_id}/keywords",
        json={"term": "microscopy", "term_en": "microscopy", "level": 1},
    )

    resp = await client.get(f"/api/v1/projects/{project_id}/keywords/search-formula?database=scopus")
    assert resp.status_code == 200
    body = resp.json()
    assert "TITLE-ABS-KEY" in body["data"]["formula"]
    assert "microscopy" in body["data"]["formula"]


@pytest.mark.asyncio
async def test_generate_search_formula_pubmed(client: AsyncClient, project_id: int):
    await client.post(
        f"/api/v1/projects/{project_id}/keywords",
        json={"term": "fluorescence", "term_en": "fluorescence", "level": 1},
    )

    resp = await client.get(f"/api/v1/projects/{project_id}/keywords/search-formula?database=pubmed")
    assert resp.status_code == 200
    body = resp.json()
    assert "[Title/Abstract]" in body["data"]["formula"]
    assert "fluorescence" in body["data"]["formula"]


@pytest.mark.asyncio
async def test_expand_keywords(client: AsyncClient, project_id: int):
    """Test keyword expansion with mock LLM (returns predefined expanded terms)."""
    resp = await client.post(
        f"/api/v1/projects/{project_id}/keywords/expand",
        json={
            "seed_terms": ["super-resolution microscopy"],
            "language": "en",
            "max_results": 10,
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "expanded_terms" in body["data"]
    assert len(body["data"]["expanded_terms"]) > 0
    assert "term" in body["data"]["expanded_terms"][0]
    assert "source" in body["data"]


@pytest.mark.asyncio
async def test_keyword_not_found_for_nonexistent_project(client: AsyncClient):
    resp = await client.get("/api/v1/projects/99999/keywords")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_nonexistent_keyword(client: AsyncClient, project_id: int):
    resp = await client.put(
        f"/api/v1/projects/{project_id}/keywords/99999",
        json={"term": "Updated"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_nonexistent_keyword(client: AsyncClient, project_id: int):
    resp = await client.delete(f"/api/v1/projects/{project_id}/keywords/99999")
    assert resp.status_code == 404
