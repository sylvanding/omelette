"""Tests for notification list, mark-read, and dismiss endpoints."""

from datetime import datetime

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import Base, engine
from app.main import app
from app.models import Notification

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


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
    resp = await client.post("/api/v1/projects", json={"name": "Test Project", "domain": "optics"})
    assert resp.status_code == 201
    return resp.json()["data"]["id"]


# ---------------------------------------------------------------------------
# Notification API Tests
# ---------------------------------------------------------------------------


class TestNotificationAPI:
    """Integration tests for the notification endpoints."""

    @pytest.mark.asyncio
    async def test_list_returns_empty_for_project_without_notifications(self, client: AsyncClient, project_id: int):
        """Verify the list endpoint returns empty when no notifications exist."""
        resp = await client.get(f"/api/v1/projects/{project_id}/notifications")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["items"] == []
        assert data["total"] == 0
        assert data["unread_count"] == 0

    @pytest.mark.asyncio
    async def test_list_returns_notifications(self, client: AsyncClient, project_id: int):
        """Verify the list endpoint returns notifications."""
        await _create_notification(project_id, "New paper match", "A new paper matches your subscription.")

        resp = await client.get(f"/api/v1/projects/{project_id}/notifications")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["total"] == 1
        assert data["unread_count"] == 1
        assert data["items"][0]["title"] == "New paper match"

    @pytest.mark.asyncio
    async def test_list_unread_only_filter(self, client: AsyncClient, project_id: int):
        """Verify the unread_only filter returns only unread notifications."""
        await _create_notification(project_id, "Unread notification", "", is_read=False)
        await _create_notification(project_id, "Read notification", "", is_read=True)

        resp = await client.get(f"/api/v1/projects/{project_id}/notifications", params={"unread_only": True})
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["total"] == 1
        assert data["items"][0]["title"] == "Unread notification"

    @pytest.mark.asyncio
    async def test_list_excludes_dismissed(self, client: AsyncClient, project_id: int):
        """Verify dismissed notifications are not returned."""
        await _create_notification(project_id, "Visible", "", is_dismissed=False)
        await _create_notification(project_id, "Hidden", "", is_dismissed=True)

        resp = await client.get(f"/api/v1/projects/{project_id}/notifications")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["total"] == 1
        assert data["items"][0]["title"] == "Visible"

    @pytest.mark.asyncio
    async def test_mark_notification_as_read(self, client: AsyncClient, project_id: int):
        """Verify marking a notification as read works."""
        notification_id = await _create_notification(project_id, "To read", "")

        resp = await client.post(f"/api/v1/projects/{project_id}/notifications/{notification_id}/read")
        assert resp.status_code == 200
        assert resp.json()["data"]["read"] is True

        # Verify it's no longer in unread count
        list_resp = await client.get(f"/api/v1/projects/{project_id}/notifications")
        assert list_resp.json()["data"]["unread_count"] == 0

    @pytest.mark.asyncio
    async def test_mark_nonexistent_notification_returns_404(self, client: AsyncClient, project_id: int):
        """Verify marking a non-existent notification returns 404."""
        resp = await client.post(f"/api/v1/projects/{project_id}/notifications/9999/read")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_mark_notification_from_other_project_returns_404(self, client: AsyncClient, project_id: int):
        """Verify marking a notification from another project returns 404."""
        notification_id = await _create_notification(project_id, "Test", "")

        other_resp = await client.post("/api/v1/projects", json={"name": "Other Project"})
        other_id = other_resp.json()["data"]["id"]

        resp = await client.post(f"/api/v1/projects/{other_id}/notifications/{notification_id}/read")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_mark_all_as_read(self, client: AsyncClient, project_id: int):
        """Verify marking all notifications as read works."""
        await _create_notification(project_id, "First", "")
        await _create_notification(project_id, "Second", "")

        resp = await client.post(f"/api/v1/projects/{project_id}/notifications/mark-all-read")
        assert resp.status_code == 200
        assert resp.json()["data"]["marked_count"] == 2

        list_resp = await client.get(f"/api/v1/projects/{project_id}/notifications")
        assert list_resp.json()["data"]["unread_count"] == 0

    @pytest.mark.asyncio
    async def test_dismiss_notification(self, client: AsyncClient, project_id: int):
        """Verify dismissing a notification removes it from the list."""
        notification_id = await _create_notification(project_id, "Dismiss me", "")

        resp = await client.delete(f"/api/v1/projects/{project_id}/notifications/{notification_id}")
        assert resp.status_code == 200
        assert resp.json()["data"]["dismissed"] is True

        list_resp = await client.get(f"/api/v1/projects/{project_id}/notifications")
        assert list_resp.json()["data"]["total"] == 0

    @pytest.mark.asyncio
    async def test_dismiss_nonexistent_notification_returns_404(self, client: AsyncClient, project_id: int):
        """Verify dismissing a non-existent notification returns 404."""
        resp = await client.delete(f"/api/v1/projects/{project_id}/notifications/9999")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_notifications_with_paper_and_subscription_refs(self, client: AsyncClient, project_id: int):
        """Verify notification paper_id and subscription_id fields are returned."""
        await _create_notification(project_id, "Paper update", "A paper was updated.", paper_id=42, subscription_id=7)

        resp = await client.get(f"/api/v1/projects/{project_id}/notifications")
        assert resp.status_code == 200
        item = resp.json()["data"]["items"][0]
        assert item["paper_id"] == 42
        assert item["subscription_id"] == 7

    @pytest.mark.asyncio
    async def test_unread_count_reflects_only_unread(self, client: AsyncClient, project_id: int):
        """Verify unread_count only counts unread, non-dismissed notifications."""
        await _create_notification(project_id, "Unread 1", "", is_read=False)
        await _create_notification(project_id, "Unread 2", "", is_read=False)
        await _create_notification(project_id, "Read", "", is_read=True)
        await _create_notification(project_id, "Dismissed", "", is_read=False, is_dismissed=True)

        resp = await client.get(f"/api/v1/projects/{project_id}/notifications")
        assert resp.status_code == 200
        assert resp.json()["data"]["unread_count"] == 2


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _create_notification(
    project_id: int,
    title: str,
    body: str,
    *,
    is_read: bool = False,
    is_dismissed: bool = False,
    paper_id: int | None = None,
    subscription_id: int | None = None,
) -> int:
    """Insert a notification directly into the database and return its ID."""
    async with engine.begin() as conn:
        result = await conn.execute(
            Notification.__table__.insert().values(
                project_id=project_id,
                type="subscription_match",
                title=title,
                body=body,
                is_read=is_read,
                is_dismissed=is_dismissed,
                paper_id=paper_id,
                subscription_id=subscription_id,
                created_at=datetime.now(),
            )
        )
        return result.inserted_primary_key[0]
