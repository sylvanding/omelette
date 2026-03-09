"""Tests for DedupService and deduplication API endpoints."""

import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import AsyncMock, patch

from app.main import app
from app.database import Base, engine
from app.services.dedup_service import DedupService


# --- Fixtures ---


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
    """Create a project and return its ID."""
    resp = await client.post("/api/v1/projects", json={"name": "Dedup Test Project", "domain": "optics"})
    assert resp.status_code == 201
    return resp.json()["data"]["id"]


# --- Unit tests: normalize_title ---


def test_normalize_title_lowercase():
    assert DedupService.normalize_title("Deep Learning") == "deep learning"


def test_normalize_title_removes_punctuation():
    assert DedupService.normalize_title("Super-Resolution Microscopy!") == "superresolution microscopy"


def test_normalize_title_collapses_whitespace():
    assert DedupService.normalize_title("  Multiple   Spaces  ") == "multiple spaces"


def test_normalize_title_unicode_normalization():
    result = DedupService.normalize_title("Café")
    assert "e" in result


def test_normalize_title_empty_after_strip():
    assert DedupService.normalize_title("---!!!") == ""


# --- Integration tests: DOI hard dedup ---


@pytest.mark.asyncio
async def test_doi_hard_dedup_removes_duplicates(client: AsyncClient, project_id: int):
    """Create papers with same DOI, run doi_only dedup, verify duplicates removed."""
    for i in range(3):
        await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={"title": f"Paper {i}", "doi": "10.1234/same-doi"},
        )
    assert (await client.get(f"/api/v1/projects/{project_id}/papers")).json()["data"]["total"] == 3

    resp = await client.post(
        f"/api/v1/projects/{project_id}/dedup/run",
        params={"strategy": "doi_only"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["removed"] == 2
    assert body["data"]["remaining"] == 1
    assert len(body["data"]["duplicates"]) == 2

    list_resp = await client.get(f"/api/v1/projects/{project_id}/papers")
    assert list_resp.json()["data"]["total"] == 1


@pytest.mark.asyncio
async def test_doi_hard_dedup_keeps_best_paper(client: AsyncClient, project_id: int):
    """DOI dedup keeps paper with higher status (pdf_downloaded > metadata_only)."""
    p1 = await client.post(
        f"/api/v1/projects/{project_id}/papers",
        json={"title": "Paper A", "doi": "10.1234/keep-best"},
    )
    await client.put(
        f"/api/v1/projects/{project_id}/papers/{p1.json()['data']['id']}",
        json={"status": "metadata_only"},
    )

    await client.post(
        f"/api/v1/projects/{project_id}/papers",
        json={"title": "Paper B", "doi": "10.1234/keep-best"},
    )

    p3 = await client.post(
        f"/api/v1/projects/{project_id}/papers",
        json={"title": "Paper C", "doi": "10.1234/keep-best"},
    )
    p3_id = p3.json()["data"]["id"]
    await client.put(
        f"/api/v1/projects/{project_id}/papers/{p3_id}",
        json={"status": "pdf_downloaded"},
    )

    await client.post(
        f"/api/v1/projects/{project_id}/dedup/run",
        params={"strategy": "doi_only"},
    )

    list_resp = await client.get(f"/api/v1/projects/{project_id}/papers")
    remaining = list_resp.json()["data"]["items"][0]
    assert remaining["status"] == "pdf_downloaded"
    assert remaining["id"] == p3_id


# --- Integration tests: Title similarity dedup ---


@pytest.mark.asyncio
async def test_title_similarity_dedup_removes_duplicates(client: AsyncClient, project_id: int):
    """Create papers with identical titles, run title_only dedup."""
    await client.post(
        f"/api/v1/projects/{project_id}/papers",
        json={"title": "Exact Same Title"},
    )
    await client.post(
        f"/api/v1/projects/{project_id}/papers",
        json={"title": "Exact Same Title"},
    )

    resp = await client.post(
        f"/api/v1/projects/{project_id}/dedup/run",
        params={"strategy": "title_only"},
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["removed"] == 1
    assert len(resp.json()["data"]["duplicates"]) == 1

    list_resp = await client.get(f"/api/v1/projects/{project_id}/papers")
    assert list_resp.json()["data"]["total"] == 1


@pytest.mark.asyncio
async def test_title_similarity_keeps_higher_citation_count(client: AsyncClient, project_id: int):
    """Title dedup keeps paper with more citations."""
    await client.post(
        f"/api/v1/projects/{project_id}/papers",
        json={"title": "Identical Title", "citation_count": 10},
    )
    await client.post(
        f"/api/v1/projects/{project_id}/papers",
        json={"title": "Identical Title", "citation_count": 50},
    )

    resp = await client.post(
        f"/api/v1/projects/{project_id}/dedup/run",
        params={"strategy": "title_only"},
    )
    assert resp.status_code == 200
    remaining = (await client.get(f"/api/v1/projects/{project_id}/papers")).json()["data"]["items"][0]
    assert remaining["citation_count"] == 50


# --- Integration tests: LLM dedup candidates ---


@pytest.mark.asyncio
async def test_find_llm_dedup_candidates(client: AsyncClient, project_id: int):
    """Find candidate pairs with similarity 0.80-0.90."""
    await client.post(
        f"/api/v1/projects/{project_id}/papers",
        json={"title": "Machine Learning"},
    )
    await client.post(
        f"/api/v1/projects/{project_id}/papers",
        json={"title": "Machine Learning Methods"},
    )

    resp = await client.get(f"/api/v1/projects/{project_id}/dedup/candidates")
    assert resp.status_code == 200
    candidates = resp.json()["data"]
    assert len(candidates) >= 1
    assert "paper_a_id" in candidates[0]
    assert "paper_b_id" in candidates[0]
    assert "similarity" in candidates[0]
    assert 0.80 <= candidates[0]["similarity"] < 0.90


@pytest.mark.asyncio
async def test_find_llm_candidates_empty_when_no_similar(client: AsyncClient, project_id: int):
    """No candidates when titles are very different."""
    await client.post(
        f"/api/v1/projects/{project_id}/papers",
        json={"title": "Completely Different Topic A"},
    )
    await client.post(
        f"/api/v1/projects/{project_id}/papers",
        json={"title": "Totally Unrelated Subject B"},
    )

    resp = await client.get(f"/api/v1/projects/{project_id}/dedup/candidates")
    assert resp.status_code == 200
    assert resp.json()["data"] == []


# --- LLM verify (mock) ---


@pytest.mark.asyncio
async def test_llm_verify_duplicate_mock(client: AsyncClient, project_id: int):
    """Verify endpoint returns mock LLM response."""
    p1 = await client.post(
        f"/api/v1/projects/{project_id}/papers",
        json={"title": "Paper One", "doi": "10.1111/a"},
    )
    p2 = await client.post(
        f"/api/v1/projects/{project_id}/papers",
        json={"title": "Paper Two", "doi": "10.2222/b"},
    )
    id_a = p1.json()["data"]["id"]
    id_b = p2.json()["data"]["id"]

    resp = await client.post(
        f"/api/v1/projects/{project_id}/dedup/verify",
        params={"paper_a_id": id_a, "paper_b_id": id_b},
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert "is_duplicate" in data
    assert "confidence" in data
    assert "reason" in data
    assert data["confidence"] == 0.85


@pytest.mark.asyncio
async def test_llm_verify_duplicate_with_patched_response(client: AsyncClient, project_id: int):
    """Verify endpoint with patched LLM returning is_duplicate=True."""
    p1 = await client.post(
        f"/api/v1/projects/{project_id}/papers",
        json={"title": "Same Work", "doi": "10.1/a"},
    )
    p2 = await client.post(
        f"/api/v1/projects/{project_id}/papers",
        json={"title": "Same Work", "doi": "10.1/a"},
    )
    id_a = p1.json()["data"]["id"]
    id_b = p2.json()["data"]["id"]

    mock_result = {"is_duplicate": True, "confidence": 0.95, "reason": "Same DOI and title"}

    with patch("app.services.llm_client.LLMClient.chat_json", new_callable=AsyncMock) as mock_chat:
        mock_chat.return_value = mock_result

        resp = await client.post(
            f"/api/v1/projects/{project_id}/dedup/verify",
            params={"paper_a_id": id_a, "paper_b_id": id_b},
        )
    assert resp.status_code == 200
    assert resp.json()["data"]["is_duplicate"] is True
    assert resp.json()["data"]["confidence"] == 0.95


# --- API endpoint: run dedup ---


@pytest.mark.asyncio
async def test_run_dedup_full_strategy(client: AsyncClient, project_id: int):
    """Run full dedup pipeline."""
    await client.post(
        f"/api/v1/projects/{project_id}/papers",
        json={"title": "A", "doi": "10.1/dup"},
    )
    await client.post(
        f"/api/v1/projects/{project_id}/papers",
        json={"title": "A", "doi": "10.1/dup"},
    )
    await client.post(
        f"/api/v1/projects/{project_id}/papers",
        json={"title": "Machine Learning"},
    )
    await client.post(
        f"/api/v1/projects/{project_id}/papers",
        json={"title": "Machine Learning Methods"},
    )

    resp = await client.post(
        f"/api/v1/projects/{project_id}/dedup/run",
        params={"strategy": "full"},
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert "stage1_doi_removed" in data
    assert "stage2_title_removed" in data
    assert "stage3_candidates" in data
    assert "total_remaining" in data
    assert "details" in data
    assert data["stage1_doi_removed"] == 1
    assert data["total_remaining"] == 3


@pytest.mark.asyncio
async def test_run_dedup_nonexistent_project(client: AsyncClient):
    resp = await client.post("/api/v1/projects/99999/dedup/run")
    assert resp.status_code == 404


# --- API endpoint: list candidates ---


@pytest.mark.asyncio
async def test_list_candidates_empty(client: AsyncClient, project_id: int):
    resp = await client.get(f"/api/v1/projects/{project_id}/dedup/candidates")
    assert resp.status_code == 200
    assert resp.json()["data"] == []


@pytest.mark.asyncio
async def test_list_candidates_nonexistent_project(client: AsyncClient):
    resp = await client.get("/api/v1/projects/99999/dedup/candidates")
    assert resp.status_code == 404


# --- API endpoint: verify ---


@pytest.mark.asyncio
async def test_verify_nonexistent_paper(client: AsyncClient, project_id: int):
    """Verify returns error when paper not found."""
    p1 = await client.post(
        f"/api/v1/projects/{project_id}/papers",
        json={"title": "Only One"},
    )
    id_a = p1.json()["data"]["id"]

    resp = await client.post(
        f"/api/v1/projects/{project_id}/dedup/verify",
        params={"paper_a_id": id_a, "paper_b_id": 99999},
    )
    assert resp.status_code == 200
    assert "error" in resp.json()["data"]
    assert resp.json()["data"]["error"] == "Paper not found"


@pytest.mark.asyncio
async def test_verify_nonexistent_project(client: AsyncClient):
    resp = await client.post(
        "/api/v1/projects/99999/dedup/verify",
        params={"paper_a_id": 1, "paper_b_id": 2},
    )
    assert resp.status_code == 404
