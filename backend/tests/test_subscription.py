"""Tests for subscription service and API."""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.database import Base, engine
from app.services.subscription_service import SubscriptionService


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
def mock_rss_xml():
    """Minimal RSS XML for testing."""
    return """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <item>
      <title>Test Paper Title</title>
      <summary>Abstract of the test paper.</summary>
      <link>https://example.com/paper/1</link>
      <guid isPermaLink="true">https://doi.org/10.1234/test.2024.001</guid>
      <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
      <author>Author One</author>
    </item>
    <item>
      <title>Another Paper</title>
      <summary>Second abstract.</summary>
      <link>https://example.com/paper/2</link>
      <id>https://doi.org/10.5678/another.2024</id>
      <published>2024-06-15T10:00:00Z</published>
    </item>
  </channel>
</rss>"""


class TestSubscriptionService:
    """Unit tests for SubscriptionService."""

    def test_get_common_feeds(self):
        feeds = SubscriptionService.get_common_feeds()
        assert len(feeds) >= 4
        assert all("name" in f and "url" in f and "category" in f for f in feeds)
        arxiv = next(f for f in feeds if "arXiv" in f["name"])
        assert "arxiv.org" in arxiv["url"]

    def test_extract_doi_from_links(self):
        service = SubscriptionService()
        entry_dict = {"links": [{"href": "https://doi.org/10.1234/test.2024"}], "id": ""}
        doi = service._extract_doi(entry_dict)
        assert doi == "10.1234/test.2024"

    def test_extract_doi_from_id(self):
        service = SubscriptionService()
        entry = {"links": [], "id": "https://doi.org/10.5678/another.2024"}
        doi = service._extract_doi(entry)
        assert doi == "10.5678/another.2024"

    def test_extract_doi_empty(self):
        service = SubscriptionService()
        entry = {"links": [], "id": "https://example.com/no-doi"}
        doi = service._extract_doi(entry)
        assert doi == ""

    @pytest.mark.asyncio
    async def test_check_rss_feed(self, mock_rss_xml):
        service = SubscriptionService()
        mock_resp = MagicMock()
        mock_resp.text = mock_rss_xml
        mock_resp.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.get = AsyncMock(return_value=mock_resp)
            mock_client_cls.return_value = mock_client

            entries = await service.check_rss_feed("https://example.com/feed.xml", since=None)
            assert len(entries) >= 1
            assert entries[0]["title"] == "Test Paper Title"
            assert entries[0]["source"] == "rss"
            assert "10.1234" in entries[0]["doi"] or entries[0]["doi"] == ""

    @pytest.mark.asyncio
    async def test_check_rss_feed_with_since_filter(self, mock_rss_xml):
        service = SubscriptionService()
        mock_resp = MagicMock()
        mock_resp.text = mock_rss_xml
        mock_resp.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.get = AsyncMock(return_value=mock_resp)
            mock_client_cls.return_value = mock_client

            # since = future date should filter all
            since = datetime(2030, 1, 1)
            entries = await service.check_rss_feed("https://example.com/feed.xml", since=since)
            assert len(entries) == 0


class TestSubscriptionAPI:
    """API endpoint tests."""

    @pytest.mark.asyncio
    async def test_list_common_feeds(self, client):
        resp = await client.get("/api/v1/projects/1/subscriptions/feeds")
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 200
        assert "data" in body
        assert isinstance(body["data"], list)
        assert len(body["data"]) >= 4

    @pytest.mark.asyncio
    async def test_check_rss_mock(self, client, mock_rss_xml):
        mock_resp = MagicMock()
        mock_resp.text = mock_rss_xml
        mock_resp.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.get = AsyncMock(return_value=mock_resp)
            mock_client_cls.return_value = mock_client

            resp = await client.post(
                "/api/v1/projects/1/subscriptions/check-rss",
                params={"feed_url": "https://example.com/feed.xml", "since_days": 7},
            )
            assert resp.status_code == 200
            body = resp.json()
            assert body["code"] == 200
            assert "entries" in body["data"]
            assert "count" in body["data"]
            assert body["data"]["count"] == len(body["data"]["entries"])
