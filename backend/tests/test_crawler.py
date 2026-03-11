"""Tests for CrawlerService and crawler API — all HTTP calls mocked."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.database import Base, engine
from app.main import app
from app.services.crawler_service import CrawlerService


def _make_paper(
    id: int = 1,
    doi: str | None = None,
    year: int | None = 2024,
    source: str = "",
    source_id: str = "",
    pdf_url: str = "",
    extra_metadata: dict | None = None,
    status: str = "pending",
) -> SimpleNamespace:
    """Create a minimal paper-like object for unit tests."""
    return SimpleNamespace(
        id=id,
        doi=doi,
        year=year,
        source=source,
        source_id=source_id,
        pdf_url=pdf_url,
        extra_metadata=extra_metadata,
        status=status,
    )


# --- Unit tests: _get_file_path ---


def test_get_file_path_with_doi(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "pdf_dir", str(tmp_path))
    service = CrawlerService()
    paper = _make_paper(id=1, doi="10.1234/abc/test", year=2023)
    path = service._get_file_path(paper)
    assert path == tmp_path / "2023" / "10.1234_abc_test.pdf"


def test_get_file_path_without_doi(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "pdf_dir", str(tmp_path))
    service = CrawlerService()
    paper = _make_paper(id=42, doi=None, year=2022)
    path = service._get_file_path(paper)
    assert path == tmp_path / "2022" / "paper_42.pdf"


def test_get_file_path_unknown_year(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "pdf_dir", str(tmp_path))
    service = CrawlerService()
    paper = _make_paper(id=1, doi="10.1/x", year=None)
    path = service._get_file_path(paper)
    assert path == tmp_path / "unknown" / "10.1_x.pdf"


# --- Unit tests: _get_channels ---


def test_get_channels_direct_first(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "pdf_dir", str(tmp_path))
    service = CrawlerService()
    paper = _make_paper(
        pdf_url="https://example.com/direct.pdf",
        doi="10.1234/test",
        source="arxiv",
        source_id="2301.00001",
    )
    channels = service._get_channels(paper)
    assert channels[0] == ("direct", "https://example.com/direct.pdf")
    assert ("unpaywall",) in [c[:1] for c in channels]
    assert ("arxiv",) in [c[:1] for c in channels]


def test_get_channels_priority_order(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "pdf_dir", str(tmp_path))
    service = CrawlerService()
    paper = _make_paper(doi="10.1234/test", source="arxiv", source_id="2301.00001")
    channels = service._get_channels(paper)
    names = [c[0] for c in channels]
    assert names == ["unpaywall", "arxiv"]


def test_get_channels_semantic_scholar_dict(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "pdf_dir", str(tmp_path))
    service = CrawlerService()
    paper = _make_paper(extra_metadata={"openAccessPdf": {"url": "https://ss.com/paper.pdf"}})
    channels = service._get_channels(paper)
    assert ("semantic_scholar", "https://ss.com/paper.pdf") in channels


def test_get_channels_semantic_scholar_string(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "pdf_dir", str(tmp_path))
    service = CrawlerService()
    paper = _make_paper(extra_metadata={"openAccessPdf": "https://ss.com/direct.pdf"})
    channels = service._get_channels(paper)
    assert ("semantic_scholar", "https://ss.com/direct.pdf") in channels


def test_get_channels_empty(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "pdf_dir", str(tmp_path))
    service = CrawlerService()
    paper = _make_paper(doi=None, source="", source_id="", extra_metadata=None)
    channels = service._get_channels(paper)
    assert channels == []


# --- Unit tests: _build_unpaywall_url ---


def test_build_unpaywall_url(monkeypatch):
    monkeypatch.setattr(settings, "unpaywall_email", "user@example.com")
    service = CrawlerService()
    url = service._build_unpaywall_url("10.1234/test")
    assert url == "https://api.unpaywall.org/v2/10.1234/test?email=user@example.com"


def test_get_channels_skips_unpaywall_when_email_empty(monkeypatch):
    """When unpaywall_email is empty, unpaywall channel is not added."""
    monkeypatch.setattr(settings, "unpaywall_email", "")
    service = CrawlerService()
    paper = _make_paper(id=1, doi="10.5678/doi", year=2024)
    channels = service._get_channels(paper)
    channel_names = [c[0] for c in channels]
    assert "unpaywall" not in channel_names


# --- Unit tests: _download_pdf (mocked) ---


@pytest.mark.asyncio
async def test_download_pdf_success(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "pdf_dir", str(tmp_path))
    pdf_content = b"%PDF-1.4 fake pdf content"

    async def mock_get(*args, **kwargs):
        resp = MagicMock()
        resp.status_code = 200
        resp.content = pdf_content
        resp.headers = {"content-type": "application/pdf"}
        resp.raise_for_status = MagicMock()
        return resp

    with patch("app.services.crawler_service.httpx.AsyncClient") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.get = AsyncMock(side_effect=mock_get)
        mock_client_cls.return_value = mock_client

        service = CrawlerService()
        paper = _make_paper(id=1, doi="10.1234/test", year=2024)
        result = await service._download_pdf("https://example.com/paper.pdf", paper)

    assert result["success"] is True
    assert result["paper_id"] == 1
    assert result["file_size"] == len(pdf_content)
    assert "md5" in result
    assert (tmp_path / "2024" / "10.1234_test.pdf").exists()


@pytest.mark.asyncio
async def test_download_pdf_unpaywall_flow(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "pdf_dir", str(tmp_path))
    pdf_content = b"%PDF-1.4 oa pdf"

    call_count = 0

    async def mock_get(url, **kwargs):
        nonlocal call_count
        call_count += 1
        resp = MagicMock()
        resp.raise_for_status = MagicMock()
        if "api.unpaywall.org" in str(url):
            resp.json.return_value = {
                "best_oa_location": {
                    "url_for_pdf": "https://oa.example.com/real.pdf",
                    "url": "https://oa.example.com/real.pdf",
                }
            }
            resp.status_code = 200
        else:
            resp.content = pdf_content
            resp.headers = {"content-type": "application/pdf"}
            resp.status_code = 200
        return resp

    with patch("app.services.crawler_service.httpx.AsyncClient") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.get = AsyncMock(side_effect=mock_get)
        mock_client_cls.return_value = mock_client

        service = CrawlerService()
        paper = _make_paper(id=2, doi="10.9999/unpaywall", year=2023)
        result = await service._download_pdf(
            "https://api.unpaywall.org/v2/10.9999/unpaywall?email=test@example.com",
            paper,
        )

    assert result["success"] is True
    assert call_count == 2  # Unpaywall API + actual PDF
    assert (tmp_path / "2023" / "10.9999_unpaywall.pdf").exists()


@pytest.mark.asyncio
async def test_download_pdf_not_pdf(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "pdf_dir", str(tmp_path))

    async def mock_get(*args, **kwargs):
        resp = MagicMock()
        resp.status_code = 200
        resp.content = b"<html>not a pdf</html>"
        resp.headers = {"content-type": "text/html"}
        resp.raise_for_status = MagicMock()
        return resp

    with patch("app.services.crawler_service.httpx.AsyncClient") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.get = AsyncMock(side_effect=mock_get)
        mock_client_cls.return_value = mock_client

        service = CrawlerService()
        paper = _make_paper(id=1, doi="10.1/x", year=2024)
        result = await service._download_pdf("https://example.com/page.html", paper)

    assert result["success"] is False
    assert "Not a PDF" in result["error"]


# --- Unit tests: batch_download ---


@pytest.mark.asyncio
async def test_batch_download_skips_already_downloaded(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "pdf_dir", str(tmp_path))
    service = CrawlerService()

    papers = [
        _make_paper(id=1, doi="10.1/a", status="pdf_downloaded"),
        _make_paper(id=2, doi="10.1/b", status="ocr_complete"),
        _make_paper(id=3, doi="10.1/c", status="indexed"),
    ]

    with patch.object(service, "download_paper", new_callable=AsyncMock) as mock_dl:
        results = await service.batch_download(papers)

    mock_dl.assert_not_called()
    assert results["skipped"] == 3
    assert results["success"] == 0
    assert results["failed"] == 0


@pytest.mark.asyncio
async def test_batch_download_calls_for_pending(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "pdf_dir", str(tmp_path))
    service = CrawlerService()

    papers = [
        _make_paper(id=1, doi="10.1/a", status="pending"),
        _make_paper(id=2, doi="10.1/b", status="metadata_only"),
    ]

    async def mock_download(paper):
        return {"success": True, "paper_id": paper.id, "file_path": "/tmp/x.pdf"}

    with patch.object(service, "download_paper", side_effect=mock_download):
        results = await service.batch_download(papers)

    assert results["success"] == 2
    assert results["failed"] == 0
    assert results["skipped"] == 0
    assert len(results["details"]) == 2


# --- Unit tests: get_storage_stats ---


def test_get_storage_stats_empty(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "pdf_dir", str(tmp_path))
    service = CrawlerService()
    stats = service.get_storage_stats()
    assert stats["total_files"] == 0
    assert stats["total_size_mb"] == 0


def test_get_storage_stats_with_files(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "pdf_dir", str(tmp_path))
    (tmp_path / "2024").mkdir()
    (tmp_path / "2024" / "paper1.pdf").write_bytes(b"x" * 1024)
    (tmp_path / "2024" / "paper2.pdf").write_bytes(b"y" * 2048)
    (tmp_path / "2023").mkdir()
    (tmp_path / "2023" / "paper3.pdf").write_bytes(b"z" * 512)

    service = CrawlerService()
    stats = service.get_storage_stats()

    assert stats["total_files"] == 3
    assert stats["total_size_mb"] == round((1024 + 2048 + 512) / (1024 * 1024), 2)
    assert stats["storage_path"] == str(tmp_path)


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


@pytest.fixture
async def project_id(client: AsyncClient) -> int:
    resp = await client.post("/api/v1/projects", json={"name": "Crawler Test Project"})
    assert resp.status_code == 201
    return resp.json()["data"]["id"]


@pytest.mark.asyncio
async def test_crawl_stats_api(client: AsyncClient, project_id: int):
    resp = await client.get(f"/api/v1/projects/{project_id}/crawl/stats")
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 200
    data = body["data"]
    assert "pending" in data
    assert "pdf_downloaded" in data
    assert "storage" in data
    assert "total_files" in data["storage"]
    assert "total_size_mb" in data["storage"]


@pytest.mark.asyncio
async def test_crawl_stats_nonexistent_project(client: AsyncClient):
    resp = await client.get("/api/v1/projects/99999/crawl/stats")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_start_crawl_no_papers(client: AsyncClient, project_id: int):
    resp = await client.post(
        f"/api/v1/projects/{project_id}/crawl/start",
        params={"priority": "high", "max_papers": 50},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 200
    assert "No papers to download" in body["data"]["message"]
    assert body["data"]["total"] == 0


@pytest.mark.asyncio
async def test_start_crawl_with_papers(client: AsyncClient, project_id: int):
    from app.database import async_session_factory
    from app.models import Paper, PaperStatus

    async with async_session_factory() as session:
        paper = Paper(
            project_id=project_id,
            title="Test Paper",
            abstract="Abstract",
            doi="10.1234/test",
            year=2024,
            source="arxiv",
            source_id="2301.00001",
            status=PaperStatus.PENDING,
        )
        session.add(paper)
        await session.commit()
        paper_id = paper.id

    with patch("app.api.v1.crawler.CrawlerService") as mock_svc_cls:
        mock_svc = MagicMock()
        mock_svc.batch_download = AsyncMock(
            return_value={
                "success": 1,
                "failed": 0,
                "skipped": 0,
                "details": [
                    {
                        "success": True,
                        "paper_id": paper_id,
                        "file_path": "/tmp/2024/10.1234_test.pdf",
                    }
                ],
            }
        )
        mock_svc_cls.return_value = mock_svc

        resp = await client.post(
            f"/api/v1/projects/{project_id}/crawl/start",
            params={"priority": "high", "max_papers": 50},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 200
    assert body["data"]["success"] == 1
    assert body["data"]["failed"] == 0
    assert len(body["data"]["details"]) == 1


@pytest.mark.asyncio
async def test_start_crawl_nonexistent_project(client: AsyncClient):
    resp = await client.post(
        "/api/v1/projects/99999/crawl/start",
        params={"priority": "high"},
    )
    assert resp.status_code == 404
