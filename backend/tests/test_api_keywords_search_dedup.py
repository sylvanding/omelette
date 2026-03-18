"""Comprehensive API tests for Keywords, Search, and Dedup modules."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from conftest import real_llm
from httpx import ASGITransport, AsyncClient

from app.database import Base, engine
from app.main import app

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
    resp = await client.post("/api/v1/projects", json={"name": "Test Project", "domain": "optics"})
    assert resp.status_code == 201
    return resp.json()["data"]["id"]


# =============================================================================
# KEYWORDS API
# =============================================================================


class TestKeywordsAPI:
    """Tests for /api/v1/projects/{project_id}/keywords endpoints."""

    @pytest.mark.asyncio
    async def test_list_keywords_empty(self, client: AsyncClient, project_id: int):
        resp = await client.get(f"/api/v1/projects/{project_id}/keywords")
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 200
        assert body["data"]["items"] == []
        assert body["data"]["total"] == 0
        assert body["data"]["page"] == 1
        assert body["data"]["page_size"] in (20, 50)

    @pytest.mark.asyncio
    async def test_create_keyword(self, client: AsyncClient, project_id: int):
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
    async def test_list_keywords_paginated(self, client: AsyncClient, project_id: int):
        for i in range(5):
            await client.post(
                f"/api/v1/projects/{project_id}/keywords",
                json={"term": f"Term {i}", "term_en": f"term{i}", "level": 1},
            )
        resp = await client.get(f"/api/v1/projects/{project_id}/keywords?page=1&page_size=2")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["data"]["items"]) == 2
        assert body["data"]["total"] == 5
        assert body["data"]["page"] == 1
        assert body["data"]["page_size"] == 2

    @pytest.mark.asyncio
    async def test_list_keywords_by_level(self, client: AsyncClient, project_id: int):
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
        assert len(body["data"]["items"]) == 2
        assert all(k["level"] == 1 for k in body["data"]["items"])

    @pytest.mark.asyncio
    async def test_bulk_create_keywords(self, client: AsyncClient, project_id: int):
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
    async def test_update_keyword(self, client: AsyncClient, project_id: int):
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
    async def test_delete_keyword(self, client: AsyncClient, project_id: int):
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
    async def test_search_formula_empty(self, client: AsyncClient, project_id: int):
        resp = await client.get(f"/api/v1/projects/{project_id}/keywords/search-formula?database=wos")
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"]["formula"] == ""
        assert body["data"]["database"] == "wos"
        assert body["data"]["keyword_count"] == 0

    @pytest.mark.asyncio
    async def test_search_formula_with_keywords(self, client: AsyncClient, project_id: int):
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
    async def test_search_formula_scopus(self, client: AsyncClient, project_id: int):
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
    async def test_expand_keywords_mock(self, client: AsyncClient, project_id: int):
        """Test keyword expansion with mock LLM."""
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
    async def test_keywords_nonexistent_project(self, client: AsyncClient):
        resp = await client.get("/api/v1/projects/99999/keywords")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_update_nonexistent_keyword(self, client: AsyncClient, project_id: int):
        resp = await client.put(
            f"/api/v1/projects/{project_id}/keywords/99999",
            json={"term": "Updated"},
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_nonexistent_keyword(self, client: AsyncClient, project_id: int):
        resp = await client.delete(f"/api/v1/projects/{project_id}/keywords/99999")
        assert resp.status_code == 404


@real_llm
@pytest.mark.asyncio
async def test_expand_keywords_real_llm(client: AsyncClient, project_id: int):
    """Test keyword expansion with real LLM — verifies non-empty content."""
    resp = await client.post(
        f"/api/v1/projects/{project_id}/keywords/expand",
        json={
            "seed_terms": ["machine learning"],
            "language": "en",
            "max_results": 5,
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["data"]["expanded_terms"]) > 0
    assert all("term" in t for t in body["data"]["expanded_terms"])


# =============================================================================
# SEARCH API
# =============================================================================


class TestSearchAPI:
    """Tests for /api/v1/projects/{project_id}/search endpoints."""

    @pytest.mark.asyncio
    async def test_execute_search_with_query(self, client: AsyncClient, project_id: int):
        mock_results = {
            "papers": [
                {
                    "title": "Test Paper",
                    "doi": "10.1234/test",
                    "abstract": "Abstract",
                    "source": "openalex",
                }
            ],
            "total": 1,
            "source_stats": {"openalex": {"count": 1}},
        }

        with patch("app.api.v1.search.SearchService") as mock_svc_cls:
            mock_svc = MagicMock()
            mock_svc.search = AsyncMock(return_value=mock_results)
            mock_svc_cls.return_value = mock_svc

            resp = await client.post(
                f"/api/v1/projects/{project_id}/search/execute",
                params={"query": "machine learning"},
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 200
        assert body["data"]["total"] == 1
        assert body["data"]["papers"][0]["title"] == "Test Paper"

    @pytest.mark.asyncio
    async def test_execute_search_from_keywords(self, client: AsyncClient, project_id: int):
        await client.post(
            f"/api/v1/projects/{project_id}/keywords",
            json={"term": "microscopy", "term_en": "microscopy", "level": 1},
        )
        mock_results = {
            "papers": [{"title": "Paper", "doi": "10.1/a", "abstract": ""}],
            "total": 1,
            "source_stats": {},
        }
        with patch("app.api.v1.search.SearchService") as mock_svc_cls:
            mock_svc = MagicMock()
            mock_svc.search = AsyncMock(return_value=mock_results)
            mock_svc_cls.return_value = mock_svc

            resp = await client.post(
                f"/api/v1/projects/{project_id}/search/execute",
                params={"query": ""},
            )
        assert resp.status_code == 200
        assert resp.json()["data"]["total"] == 1

    @pytest.mark.asyncio
    async def test_execute_search_no_query_no_keywords(self, client: AsyncClient, project_id: int):
        resp = await client.post(
            f"/api/v1/projects/{project_id}/search/execute",
            params={"query": ""},
        )
        assert resp.status_code == 400
        assert "no keywords" in resp.json()["message"].lower()

    @pytest.mark.asyncio
    async def test_execute_search_with_sources(self, client: AsyncClient, project_id: int):
        mock_results = {
            "papers": [],
            "total": 0,
            "source_stats": {"semantic_scholar": {"count": 0}, "arxiv": {"count": 0}},
        }
        with patch("app.api.v1.search.SearchService") as mock_svc_cls:
            mock_svc = MagicMock()
            mock_svc.search = AsyncMock(return_value=mock_results)
            mock_svc_cls.return_value = mock_svc

            resp = await client.post(
                f"/api/v1/projects/{project_id}/search/execute",
                params={"query": "test", "sources": ["semantic_scholar", "arxiv"]},
            )
        assert resp.status_code == 200
        body = resp.json()
        assert "source_stats" in body["data"]

    @pytest.mark.asyncio
    async def test_list_search_sources(self, client: AsyncClient, project_id: int):
        resp = await client.get(f"/api/v1/projects/{project_id}/search/sources")
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 200
        sources = body["data"]
        assert len(sources) >= 4
        ids = [s["id"] for s in sources]
        assert "semantic_scholar" in ids
        assert "openalex" in ids
        assert "arxiv" in ids
        assert "crossref" in ids

    @pytest.mark.asyncio
    async def test_search_nonexistent_project(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/projects/99999/search/execute",
            params={"query": "test"},
        )
        assert resp.status_code == 404


# =============================================================================
# DEDUP API
# =============================================================================


class TestDedupAPI:
    """Tests for /api/v1/projects/{project_id}/dedup endpoints."""

    @pytest.mark.asyncio
    async def test_run_dedup_doi_only(self, client: AsyncClient, project_id: int):
        for i in range(3):
            await client.post(
                f"/api/v1/projects/{project_id}/papers",
                json={"title": f"Paper {i}", "doi": "10.1234/same-doi"},
            )
        resp = await client.post(
            f"/api/v1/projects/{project_id}/dedup/run",
            params={"strategy": "doi_only"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"]["removed"] == 2
        assert body["data"]["remaining"] == 1

    @pytest.mark.asyncio
    async def test_run_dedup_title_only(self, client: AsyncClient, project_id: int):
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

    @pytest.mark.asyncio
    async def test_run_dedup_full(self, client: AsyncClient, project_id: int):
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
        assert data["stage1_doi_removed"] == 1

    @pytest.mark.asyncio
    async def test_list_candidates_empty(self, client: AsyncClient, project_id: int):
        resp = await client.get(f"/api/v1/projects/{project_id}/dedup/candidates")
        assert resp.status_code == 200
        assert resp.json()["data"]["items"] == []

    @pytest.mark.asyncio
    async def test_list_candidates_with_similar_titles(self, client: AsyncClient, project_id: int):
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
        candidates = resp.json()["data"]["items"]
        assert len(candidates) >= 1
        assert "paper_a_id" in candidates[0]
        assert "paper_b_id" in candidates[0]
        assert "similarity" in candidates[0]
        assert 0.80 <= candidates[0]["similarity"] < 0.90

    @pytest.mark.asyncio
    async def test_verify_duplicate_mock(self, client: AsyncClient, project_id: int):
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

    @pytest.mark.asyncio
    async def test_verify_duplicate_paper_not_found(self, client: AsyncClient, project_id: int):
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
    async def test_resolve_keep_old(self, client: AsyncClient, project_id: int):
        paper_resp = await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={"title": "Test Paper"},
        )
        paper_id = paper_resp.json()["data"]["id"]
        resp = await client.post(
            f"/api/v1/projects/{project_id}/dedup/resolve",
            json={"conflict_id": f"{paper_id}:dummy.pdf", "action": "keep_old"},
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["action"] == "keep_old"

    @pytest.mark.asyncio
    async def test_resolve_invalid_conflict_id(self, client: AsyncClient, project_id: int):
        resp = await client.post(
            f"/api/v1/projects/{project_id}/dedup/resolve",
            json={"conflict_id": "invalid", "action": "keep_old"},
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_resolve_nonexistent_paper(self, client: AsyncClient, project_id: int):
        resp = await client.post(
            f"/api/v1/projects/{project_id}/dedup/resolve",
            json={"conflict_id": "999:nonexistent.pdf", "action": "keep_old"},
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_auto_resolve_empty(self, client: AsyncClient, project_id: int):
        resp = await client.post(
            f"/api/v1/projects/{project_id}/dedup/auto-resolve",
            json={"conflict_ids": []},
        )
        assert resp.status_code == 200
        assert resp.json()["data"] == []

    @pytest.mark.asyncio
    async def test_dedup_nonexistent_project(self, client: AsyncClient):
        resp = await client.post("/api/v1/projects/99999/dedup/run")
        assert resp.status_code == 404

        resp = await client.get("/api/v1/projects/99999/dedup/candidates")
        assert resp.status_code == 404


@real_llm
@pytest.mark.asyncio
async def test_verify_duplicate_real_llm(client: AsyncClient, project_id: int):
    """Test verify with real LLM — verifies non-empty reason."""
    p1 = await client.post(
        f"/api/v1/projects/{project_id}/papers",
        json={"title": "Deep Learning", "doi": "10.1/a"},
    )
    p2 = await client.post(
        f"/api/v1/projects/{project_id}/papers",
        json={"title": "Deep Learning", "doi": "10.1/a"},
    )
    id_a = p1.json()["data"]["id"]
    id_b = p2.json()["data"]["id"]
    resp = await client.post(
        f"/api/v1/projects/{project_id}/dedup/verify",
        params={"paper_a_id": id_a, "paper_b_id": id_b},
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert "reason" in data
    assert len(data["reason"]) > 0
