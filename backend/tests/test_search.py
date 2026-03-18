"""Tests for SearchService and search API — all HTTP calls mocked."""

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from httpx import ASGITransport, AsyncClient

from app.database import Base, engine
from app.main import app
from app.services.search_service import (
    ArXivProvider,
    CrossrefProvider,
    OpenAlexProvider,
    SearchService,
    SemanticScholarProvider,
    StandardizedPaper,
    _reconstruct_abstract_from_inverted_index,
)

# --- Unit tests for abstract reconstruction ---


def test_reconstruct_abstract_from_inverted_index():
    inv = {"The": [0], "cat": [1], "sat": [2]}
    assert _reconstruct_abstract_from_inverted_index(inv) == "The cat sat"


def test_reconstruct_abstract_empty():
    assert _reconstruct_abstract_from_inverted_index({}) == ""


# --- Semantic Scholar provider ---


@pytest.mark.asyncio
async def test_semantic_scholar_provider_parsing():
    mock_data = {
        "data": [
            {
                "paperId": "abc123",
                "title": "Test Paper Title",
                "abstract": "Abstract content here",
                "authors": [{"name": "Alice Smith"}, {"name": "Bob Jones"}],
                "journal": {"name": "Nature"},
                "year": 2023,
                "citationCount": 42,
                "externalIds": {"DOI": "10.1234/test"},
                "openAccessPdf": {"url": "https://example.com/paper.pdf"},
                "url": "https://semanticscholar.org/paper/abc123",
            }
        ]
    }

    async def mock_get(*args, **kwargs):
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = mock_data
        resp.raise_for_status = MagicMock()
        return resp

    with patch("app.services.search_service.httpx.AsyncClient") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.get = AsyncMock(side_effect=mock_get)
        mock_client_cls.return_value = mock_client

        provider = SemanticScholarProvider()
        papers = await provider.search("test query", max_results=10)

    assert len(papers) == 1
    p = papers[0]
    assert p.title == "Test Paper Title"
    assert p.abstract == "Abstract content here"
    assert p.doi == "10.1234/test"
    assert p.year == 2023
    assert p.citation_count == 42
    assert p.source == "semantic_scholar"
    assert p.source_id == "abc123"
    assert p.pdf_url == "https://example.com/paper.pdf"
    assert len(p.authors) == 2
    assert p.authors[0]["name"] == "Alice Smith"
    assert p.journal == "Nature"


# --- OpenAlex provider ---


@pytest.mark.asyncio
async def test_openalex_provider_parsing():
    mock_data = {
        "results": [
            {
                "id": "https://openalex.org/W123",
                "display_name": "OpenAlex Paper",
                "abstract_inverted_index": {"Hello": [0], "world": [1]},
                "authorships": [
                    {
                        "author": {"display_name": "Jane Doe"},
                        "institutions": [{"display_name": "MIT"}],
                    }
                ],
                "ids": {"doi": "https://doi.org/10.5678/openalex"},
                "primary_location": {
                    "source": {"display_name": "Science"},
                    "pdf_url": "https://example.com/oa.pdf",
                },
                "publication_year": 2022,
                "cited_by_count": 100,
            }
        ]
    }

    async def mock_get(*args, **kwargs):
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = mock_data
        resp.raise_for_status = MagicMock()
        return resp

    with patch("app.services.search_service.httpx.AsyncClient") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.get = AsyncMock(side_effect=mock_get)
        mock_client_cls.return_value = mock_client

        provider = OpenAlexProvider()
        papers = await provider.search("test", max_results=10)

    assert len(papers) == 1
    p = papers[0]
    assert p.title == "OpenAlex Paper"
    assert p.abstract == "Hello world"
    assert p.doi == "10.5678/openalex"
    assert p.year == 2022
    assert p.citation_count == 100
    assert p.source == "openalex"
    assert p.source_id == "W123"
    assert p.pdf_url == "https://example.com/oa.pdf"
    assert p.journal == "Science"
    assert len(p.authors) == 1
    assert p.authors[0]["name"] == "Jane Doe"
    assert p.authors[0]["affiliation"] == "MIT"


# --- ArXiv provider ---


@pytest.mark.asyncio
async def test_arxiv_provider_xml_parsing():
    xml_body = """<?xml version='1.0'?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
  <entry>
    <id>http://arxiv.org/abs/2301.00001v1</id>
    <title>ArXiv Test Paper</title>
    <summary>This is the abstract.</summary>
    <link href="https://arxiv.org/pdf/2301.00001.pdf" rel="related" type="application/pdf"/>
    <author><name>Author One</name></author>
    <author><name>Author Two</name></author>
  </entry>
</feed>"""

    async def mock_get(*args, **kwargs):
        resp = MagicMock()
        resp.status_code = 200
        resp.content = xml_body.encode()
        resp.raise_for_status = MagicMock()
        return resp

    with patch("app.services.search_service.httpx.AsyncClient") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.get = AsyncMock(side_effect=mock_get)
        mock_client_cls.return_value = mock_client

        provider = ArXivProvider()
        papers = await provider.search("test", max_results=10)

    assert len(papers) == 1
    p = papers[0]
    assert p.title == "ArXiv Test Paper"
    assert p.abstract == "This is the abstract."
    assert p.journal == "arXiv"
    assert p.source == "arxiv"
    assert p.source_id == "2301.00001v1"
    assert "arxiv.org/pdf" in p.pdf_url
    assert len(p.authors) == 2
    assert p.authors[0]["name"] == "Author One"


# --- Crossref provider ---


@pytest.mark.asyncio
async def test_crossref_provider_parsing():
    mock_data = {
        "message": {
            "items": [
                {
                    "DOI": "10.9999/crossref-test",
                    "title": ["Crossref Paper Title"],
                    "abstract": "Crossref abstract.",
                    "author": [{"given": "John", "family": "Doe", "affiliation": [{"name": "Harvard"}]}],
                    "container-title": ["Journal of Tests"],
                    "published": {"date-parts": [[2021, 5]]},
                    "is-referenced-by-count": 15,
                    "URL": "https://doi.org/10.9999/crossref-test",
                }
            ]
        }
    }

    async def mock_get(*args, **kwargs):
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = mock_data
        resp.raise_for_status = MagicMock()
        return resp

    with patch("app.services.search_service.httpx.AsyncClient") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.get = AsyncMock(side_effect=mock_get)
        mock_client_cls.return_value = mock_client

        provider = CrossrefProvider()
        papers = await provider.search("test", max_results=10)

    assert len(papers) == 1
    p = papers[0]
    assert p.title == "Crossref Paper Title"
    assert p.abstract == "Crossref abstract."
    assert p.doi == "10.9999/crossref-test"
    assert p.year == 2021
    assert p.citation_count == 15
    assert p.source == "crossref"
    assert p.journal == "Journal of Tests"
    assert len(p.authors) == 1
    assert p.authors[0]["name"] == "John Doe"
    assert p.authors[0]["affiliation"] == "Harvard"


# --- Federated search ---


@pytest.mark.asyncio
async def test_federated_search_multiple_sources():
    call_count = 0

    async def mock_get(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        resp = MagicMock()
        resp.status_code = 200
        if "openalex" in str(args[0]):
            resp.json.return_value = {
                "results": [
                    {
                        "id": "https://openalex.org/W1",
                        "display_name": "OpenAlex Paper",
                        "authorships": [],
                        "ids": {},
                        "primary_location": {},
                        "publication_year": 2020,
                        "cited_by_count": 0,
                    }
                ]
            }
        elif "arxiv" in str(args[0]):
            resp.content = b"""<?xml version='1.0'?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2001.00001</id>
    <title>ArXiv Paper</title>
    <summary>ArXiv abstract</summary>
    <author><name>X</name></author>
  </entry>
</feed>"""
        else:
            resp.json.return_value = {"data": [], "message": {"items": []}}
        resp.raise_for_status = MagicMock()
        return resp

    with patch("app.services.search_service.httpx.AsyncClient") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.get = AsyncMock(side_effect=mock_get)
        mock_client_cls.return_value = mock_client

        service = SearchService()
        results = await service.search(
            "machine learning",
            sources=["openalex", "arxiv"],
            max_results=10,
        )

    assert results["total"] >= 2
    assert "openalex" in results["source_stats"]
    assert "arxiv" in results["source_stats"]
    assert results["source_stats"]["openalex"]["count"] == 1
    assert results["source_stats"]["arxiv"]["count"] == 1
    assert len(results["papers"]) == 2
    titles = {p["title"] for p in results["papers"]}
    assert "OpenAlex Paper" in titles
    assert "ArXiv Paper" in titles


# --- Error handling ---


@pytest.mark.asyncio
async def test_search_handles_failed_source():
    async def mock_get(*args, **kwargs):
        if "openalex" in str(args[0]):
            raise httpx.HTTPStatusError("429", request=MagicMock(), response=MagicMock())
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = {"results": []}
        resp.raise_for_status = MagicMock()
        return resp

    with patch("app.services.search_service.httpx.AsyncClient") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.get = AsyncMock(side_effect=mock_get)
        mock_client_cls.return_value = mock_client

        service = SearchService()
        results = await service.search(
            "test",
            sources=["openalex", "arxiv"],
            max_results=10,
        )

    assert "openalex" in results["source_stats"]
    assert results["source_stats"]["openalex"]["count"] == 0
    assert "error" in results["source_stats"]["openalex"]
    assert "arxiv" in results["source_stats"]
    assert results["source_stats"]["arxiv"]["count"] == 0
    assert results["total"] == 0


# --- StandardizedPaper ---


def test_standardized_paper_to_dict():
    p = StandardizedPaper(
        doi="10.1234/test",
        title="Title",
        abstract="Abstract",
        authors=[{"name": "A", "affiliation": "B"}],
        journal="J",
        year=2020,
        citation_count=5,
        source="test",
        source_id="id1",
        pdf_url="https://x.pdf",
        url="https://doi.org/10.1234/test",
    )
    d = p.to_dict()
    assert d["doi"] == "10.1234/test"
    assert d["title"] == "Title"
    assert d["authors"] == [{"name": "A", "affiliation": "B"}]
    assert d["year"] == 2020
    assert d["citation_count"] == 5


# --- API endpoint tests ---


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
async def test_execute_search_api(client: AsyncClient):
    """Test POST /execute with mocked SearchService."""
    # Create project
    create_resp = await client.post("/api/v1/projects", json={"name": "Test Project"})
    assert create_resp.status_code == 201
    project_id = create_resp.json()["data"]["id"]

    mock_results = {
        "papers": [{"title": "API Test Paper", "doi": "10.1234/api", "abstract": "Abstract"}],
        "total": 1,
        "source_stats": {"openalex": {"count": 1}},
    }

    async def mock_search(*args, **kwargs):
        return mock_results

    with patch("app.api.v1.search.SearchService") as mock_svc_cls:
        mock_svc = MagicMock()
        mock_svc.search = AsyncMock(side_effect=mock_search)
        mock_svc_cls.return_value = mock_svc

        resp = await client.post(
            f"/api/v1/projects/{project_id}/search/execute",
            params={"query": "machine learning"},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 200
    assert body["data"]["total"] == 1
    assert body["data"]["papers"][0]["title"] == "API Test Paper"


@pytest.mark.asyncio
async def test_execute_search_no_query_no_keywords(client: AsyncClient):
    """Test 400 when no query and no keywords."""
    create_resp = await client.post("/api/v1/projects", json={"name": "Empty Project"})
    project_id = create_resp.json()["data"]["id"]

    resp = await client.post(
        f"/api/v1/projects/{project_id}/search/execute",
        params={"query": ""},
    )
    assert resp.status_code == 400
    assert "no keywords" in resp.json()["message"].lower()


@pytest.mark.asyncio
async def test_execute_search_nonexistent_project(client: AsyncClient):
    resp = await client.post(
        "/api/v1/projects/99999/search/execute",
        params={"query": "test"},
    )
    assert resp.status_code == 404
