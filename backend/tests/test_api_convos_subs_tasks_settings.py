"""Comprehensive API tests for Conversations, Subscriptions, Tasks, Settings, and Pipelines."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import Base, async_session_factory, engine
from app.main import app
from app.models import Message, Project, Task


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
async def project(setup_db):
    async with async_session_factory() as db:
        p = Project(name="Test Project", description="For API tests")
        db.add(p)
        await db.commit()
        await db.refresh(p)
        return p


# ── Conversations ──


class TestConversationsAPI:
    """Tests for /api/v1/conversations."""

    @pytest.mark.asyncio
    async def test_list_conversations_empty(self, client):
        resp = await client.get("/api/v1/conversations")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["items"] == []
        assert data["total"] == 0
        assert "page" in data
        assert "page_size" in data

    @pytest.mark.asyncio
    async def test_list_conversations_paginated(self, client):
        for i in range(5):
            await client.post("/api/v1/conversations", json={"title": f"Conv {i}"})
        resp = await client.get("/api/v1/conversations", params={"page": 1, "page_size": 2})
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data["items"]) == 2
        assert data["total"] == 5
        assert data["page"] == 1
        assert data["page_size"] == 2
        assert data["total_pages"] == 3

    @pytest.mark.asyncio
    async def test_list_conversations_filter_by_knowledge_base_id(self, client):
        await client.post(
            "/api/v1/conversations",
            json={"title": "KB1", "knowledge_base_ids": [1, 2]},
        )
        await client.post(
            "/api/v1/conversations",
            json={"title": "KB2", "knowledge_base_ids": [3, 4]},
        )
        resp = await client.get("/api/v1/conversations", params={"knowledge_base_id": 1})
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["total"] == 1
        assert data["items"][0]["knowledge_base_ids"] == [1, 2]

    @pytest.mark.asyncio
    async def test_create_conversation(self, client):
        resp = await client.post(
            "/api/v1/conversations",
            json={
                "title": "New Chat",
                "knowledge_base_ids": [1, 2],
                "model": "gpt-4o",
                "tool_mode": "citation",
            },
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["title"] == "New Chat"
        assert data["knowledge_base_ids"] == [1, 2]
        assert data["model"] == "gpt-4o"
        assert data["tool_mode"] == "citation"
        assert data["messages"] == []
        assert "id" in data
        assert "created_at" in data

    @pytest.mark.asyncio
    async def test_create_conversation_default_title(self, client):
        resp = await client.post("/api/v1/conversations", json={})
        assert resp.status_code == 200
        assert resp.json()["data"]["title"] == "新对话"

    @pytest.mark.asyncio
    async def test_get_conversation_with_messages(self, client):
        create_resp = await client.post(
            "/api/v1/conversations",
            json={"title": "With Messages", "knowledge_base_ids": [1]},
        )
        conv_id = create_resp.json()["data"]["id"]
        async with async_session_factory() as db:
            msg = Message(
                conversation_id=conv_id,
                role="user",
                content="Hello",
            )
            db.add(msg)
            await db.commit()

        resp = await client.get(f"/api/v1/conversations/{conv_id}")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["title"] == "With Messages"
        assert len(data["messages"]) == 1
        assert data["messages"][0]["role"] == "user"
        assert data["messages"][0]["content"] == "Hello"

    @pytest.mark.asyncio
    async def test_get_conversation_not_found(self, client):
        resp = await client.get("/api/v1/conversations/99999")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_update_conversation(self, client):
        create_resp = await client.post(
            "/api/v1/conversations",
            json={"title": "Old", "tool_mode": "qa"},
        )
        conv_id = create_resp.json()["data"]["id"]
        resp = await client.put(
            f"/api/v1/conversations/{conv_id}",
            json={"title": "Updated", "tool_mode": "outline"},
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["title"] == "Updated"
        assert data["tool_mode"] == "outline"

    @pytest.mark.asyncio
    async def test_update_conversation_not_found(self, client):
        resp = await client.put(
            "/api/v1/conversations/99999",
            json={"title": "X"},
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_conversation(self, client):
        create_resp = await client.post(
            "/api/v1/conversations",
            json={"title": "To Delete"},
        )
        conv_id = create_resp.json()["data"]["id"]
        resp = await client.delete(f"/api/v1/conversations/{conv_id}")
        assert resp.status_code == 200
        assert resp.json()["data"]["deleted"] is True
        assert resp.json()["data"]["id"] == conv_id

        resp2 = await client.get(f"/api/v1/conversations/{conv_id}")
        assert resp2.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_conversation_not_found(self, client):
        resp = await client.delete("/api/v1/conversations/99999")
        assert resp.status_code == 404


# ── Subscriptions ──


class TestSubscriptionsAPI:
    """Tests for /api/v1/projects/{project_id}/subscriptions."""

    @pytest.mark.asyncio
    async def test_list_subscriptions_empty(self, client, project):
        resp = await client.get(f"/api/v1/projects/{project.id}/subscriptions")
        assert resp.status_code == 200
        assert resp.json()["data"] == []

    @pytest.mark.asyncio
    async def test_create_subscription_api_type(self, client, project):
        resp = await client.post(
            f"/api/v1/projects/{project.id}/subscriptions",
            json={
                "name": "API Sub",
                "query": "machine learning",
                "sources": ["semantic_scholar", "arxiv"],
                "frequency": "weekly",
                "max_results": 50,
            },
        )
        assert resp.status_code == 201
        data = resp.json()["data"]
        assert data["name"] == "API Sub"
        assert data["query"] == "machine learning"
        assert data["sources"] == ["semantic_scholar", "arxiv"]
        assert data["frequency"] == "weekly"
        assert data["max_results"] == 50
        assert data["project_id"] == project.id
        assert data["is_active"] is True

    @pytest.mark.asyncio
    async def test_create_subscription_minimal(self, client, project):
        resp = await client.post(
            f"/api/v1/projects/{project.id}/subscriptions",
            json={"name": "Minimal Sub"},
        )
        assert resp.status_code == 201
        data = resp.json()["data"]
        assert data["name"] == "Minimal Sub"
        assert data["query"] == ""
        assert data["sources"] == []
        assert data["frequency"] == "weekly"
        assert data["max_results"] == 50

    @pytest.mark.asyncio
    async def test_get_subscription(self, client, project):
        create_resp = await client.post(
            f"/api/v1/projects/{project.id}/subscriptions",
            json={"name": "Get Me"},
        )
        sub_id = create_resp.json()["data"]["id"]
        resp = await client.get(f"/api/v1/projects/{project.id}/subscriptions/{sub_id}")
        assert resp.status_code == 200
        assert resp.json()["data"]["name"] == "Get Me"

    @pytest.mark.asyncio
    async def test_get_subscription_not_found(self, client, project):
        resp = await client.get(f"/api/v1/projects/{project.id}/subscriptions/99999")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_get_subscription_wrong_project(self, client, project):
        create_resp = await client.post(
            f"/api/v1/projects/{project.id}/subscriptions",
            json={"name": "Sub"},
        )
        sub_id = create_resp.json()["data"]["id"]
        resp = await client.get(f"/api/v1/projects/99999/subscriptions/{sub_id}")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_update_subscription(self, client, project):
        create_resp = await client.post(
            f"/api/v1/projects/{project.id}/subscriptions",
            json={"name": "Old", "query": "old query"},
        )
        sub_id = create_resp.json()["data"]["id"]
        resp = await client.put(
            f"/api/v1/projects/{project.id}/subscriptions/{sub_id}",
            json={"name": "New Name", "query": "new query", "is_active": False},
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["name"] == "New Name"
        assert data["query"] == "new query"
        assert data["is_active"] is False

    @pytest.mark.asyncio
    async def test_delete_subscription(self, client, project):
        create_resp = await client.post(
            f"/api/v1/projects/{project.id}/subscriptions",
            json={"name": "To Delete"},
        )
        sub_id = create_resp.json()["data"]["id"]
        resp = await client.delete(f"/api/v1/projects/{project.id}/subscriptions/{sub_id}")
        assert resp.status_code == 200

        resp2 = await client.get(f"/api/v1/projects/{project.id}/subscriptions/{sub_id}")
        assert resp2.status_code == 404

    @pytest.mark.asyncio
    async def test_trigger_subscription(self, client, project):
        create_resp = await client.post(
            f"/api/v1/projects/{project.id}/subscriptions",
            json={"name": "Trigger Sub", "query": "test", "max_results": 10},
        )
        sub_id = create_resp.json()["data"]["id"]
        resp = await client.post(
            f"/api/v1/projects/{project.id}/subscriptions/{sub_id}/trigger",
            params={"since_days": 7},
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert "new_papers" in data
        assert "total_checked" in data
        assert "sources_searched" in data

    @pytest.mark.asyncio
    async def test_check_rss(self, client, project):
        mock_rss = """<?xml version="1.0"?>
<rss version="2.0"><channel><title>Test</title>
<item><title>Paper</title><link>https://example.com</link><guid>https://doi.org/10.1234/test</guid></item>
</channel></rss>"""
        mock_resp = MagicMock()
        mock_resp.text = mock_rss
        mock_resp.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.get = AsyncMock(return_value=mock_resp)
            mock_client_cls.return_value = mock_client

            resp = await client.post(
                f"/api/v1/projects/{project.id}/subscriptions/check-rss",
                params={"feed_url": "https://example.com/feed.xml", "since_days": 7},
            )
            assert resp.status_code == 200
            data = resp.json()["data"]
            assert "entries" in data
            assert "count" in data

    @pytest.mark.asyncio
    async def test_list_common_feeds(self, client, project):
        resp = await client.get(f"/api/v1/projects/{project.id}/subscriptions/feeds")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert isinstance(data, list)
        assert len(data) >= 4
        assert all("name" in f and "url" in f for f in data)


# ── Tasks ──


class TestTasksAPI:
    """Tests for /api/v1/tasks."""

    @pytest.mark.asyncio
    async def test_list_tasks_empty(self, client):
        resp = await client.get("/api/v1/tasks")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["items"] == []
        assert data["total"] == 0
        assert "page" in data
        assert "page_size" in data

    @pytest.mark.asyncio
    async def test_list_tasks_paginated(self, client, project):
        async with async_session_factory() as db:
            for _ in range(5):
                t = Task(
                    project_id=project.id,
                    task_type="search",
                    status="pending",
                )
                db.add(t)
            await db.commit()

        resp = await client.get("/api/v1/tasks", params={"page": 1, "page_size": 2})
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data["items"]) == 2
        assert data["total"] == 5
        assert data["page"] == 1
        assert data["page_size"] == 2

    @pytest.mark.asyncio
    async def test_list_tasks_filter_by_status(self, client, project):
        async with async_session_factory() as db:
            db.add(Task(project_id=project.id, task_type="search", status="pending"))
            db.add(Task(project_id=project.id, task_type="search", status="running"))
            db.add(Task(project_id=project.id, task_type="search", status="completed"))
            await db.commit()

        resp = await client.get("/api/v1/tasks", params={"status": "pending"})
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["total"] == 1
        assert data["items"][0]["status"] == "pending"

    @pytest.mark.asyncio
    async def test_list_tasks_filter_by_project_id(self, client, project):
        async with async_session_factory() as db:
            db.add(Task(project_id=project.id, task_type="search", status="pending"))
            await db.commit()

        resp = await client.get("/api/v1/tasks", params={"project_id": project.id})
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["total"] == 1
        assert data["items"][0]["project_id"] == project.id

    @pytest.mark.asyncio
    async def test_get_task(self, client, project):
        async with async_session_factory() as db:
            t = Task(
                project_id=project.id,
                task_type="search",
                status="running",
                progress=50,
                total=100,
            )
            db.add(t)
            await db.commit()
            await db.refresh(t)
            task_id = t.id

        resp = await client.get(f"/api/v1/tasks/{task_id}")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["id"] == task_id
        assert data["task_type"] == "search"
        assert data["status"] == "running"
        assert data["progress"] == 50
        assert data["total"] == 100

    @pytest.mark.asyncio
    async def test_get_task_not_found(self, client):
        resp = await client.get("/api/v1/tasks/99999")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_cancel_task(self, client, project):
        async with async_session_factory() as db:
            t = Task(
                project_id=project.id,
                task_type="search",
                status="running",
            )
            db.add(t)
            await db.commit()
            await db.refresh(t)
            task_id = t.id

        resp = await client.post(f"/api/v1/tasks/{task_id}/cancel")
        assert resp.status_code == 200
        assert resp.json()["message"] == "Task cancelled"

        resp2 = await client.get(f"/api/v1/tasks/{task_id}")
        assert resp2.json()["data"]["status"] == "cancelled"

    @pytest.mark.asyncio
    async def test_cancel_task_already_completed_fails(self, client, project):
        async with async_session_factory() as db:
            t = Task(
                project_id=project.id,
                task_type="search",
                status="completed",
            )
            db.add(t)
            await db.commit()
            await db.refresh(t)
            task_id = t.id

        resp = await client.post(f"/api/v1/tasks/{task_id}/cancel")
        assert resp.status_code == 400
        assert "Cannot cancel" in resp.json()["detail"]

    @pytest.mark.asyncio
    async def test_cancel_task_not_found(self, client):
        resp = await client.post("/api/v1/tasks/99999/cancel")
        assert resp.status_code == 404


# ── Settings ──


class TestSettingsAPI:
    """Tests for /api/v1/settings."""

    @pytest.mark.asyncio
    async def test_get_settings(self, client):
        resp = await client.get("/api/v1/settings")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["llm_provider"] == "mock"
        for key in ["openai_api_key", "anthropic_api_key"]:
            val = data.get(key, "")
            assert "***" in val or val == ""

    @pytest.mark.asyncio
    async def test_put_settings(self, client):
        resp = await client.put(
            "/api/v1/settings",
            json={"llm_provider": "openai", "llm_temperature": 0.7},
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["llm_provider"] == "openai"
        assert data["llm_temperature"] == 0.7

        resp2 = await client.get("/api/v1/settings")
        assert resp2.json()["data"]["llm_provider"] == "openai"

    @pytest.mark.asyncio
    async def test_list_models(self, client):
        resp = await client.get("/api/v1/settings/models")
        assert resp.status_code == 200
        data = resp.json()["data"]
        providers = [p["provider"] for p in data]
        assert "openai" in providers
        assert "anthropic" in providers
        assert "mock" in providers

    @pytest.mark.asyncio
    async def test_test_connection_mock(self, client):
        resp = await client.post("/api/v1/settings/test-connection")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["success"] is True
        assert "response" in data

    @pytest.mark.asyncio
    async def test_health_check_unauthenticated(self, client):
        """Health endpoint is auth-exempt and returns 200."""
        resp = await client.get("/api/v1/settings/health")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["status"] == "healthy"
        assert "version" in data


# ── Pipelines ──


class TestPipelinesAPI:
    """Tests for /api/v1/pipelines."""

    @pytest.mark.asyncio
    async def test_start_search_pipeline(self, client, project):
        with patch("app.services.search_service.SearchService.search", new_callable=AsyncMock) as mock_search:
            mock_search.return_value = {"papers": [], "total": 0}

            resp = await client.post(
                "/api/v1/pipelines/search",
                json={
                    "project_id": project.id,
                    "query": "machine learning",
                    "max_results": 10,
                },
            )
            assert resp.status_code == 200
            data = resp.json()["data"]
            assert "thread_id" in data
            assert data["status"] == "running"
            assert data["project_id"] == project.id

    @pytest.mark.asyncio
    async def test_start_search_pipeline_project_not_found(self, client):
        resp = await client.post(
            "/api/v1/pipelines/search",
            json={
                "project_id": 99999,
                "query": "test",
                "max_results": 10,
            },
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_get_pipeline_status(self, client, project):
        with patch("app.services.search_service.SearchService.search", new_callable=AsyncMock) as mock_search:
            mock_search.return_value = {"papers": [], "total": 0}

            start_resp = await client.post(
                "/api/v1/pipelines/search",
                json={
                    "project_id": project.id,
                    "query": "test",
                    "max_results": 5,
                },
            )
            thread_id = start_resp.json()["data"]["thread_id"]

            import asyncio

            await asyncio.sleep(1)

            status_resp = await client.get(f"/api/v1/pipelines/{thread_id}/status")
            assert status_resp.status_code == 200
            data = status_resp.json()["data"]
            assert data["thread_id"] == thread_id
            assert "status" in data

    @pytest.mark.asyncio
    async def test_get_pipeline_status_not_found(self, client):
        resp = await client.get("/api/v1/pipelines/nonexistent_thread/status")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_resume_pipeline_not_found(self, client):
        resp = await client.post(
            "/api/v1/pipelines/nonexistent/resume",
            json={"resolved_conflicts": []},
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_resume_pipeline_not_interrupted(self, client, project):
        """Resume returns 400 when pipeline is completed, not interrupted."""
        with patch("app.services.search_service.SearchService.search", new_callable=AsyncMock) as mock_search:
            mock_search.return_value = {"papers": [], "total": 0}

            start_resp = await client.post(
                "/api/v1/pipelines/search",
                json={
                    "project_id": project.id,
                    "query": "test",
                    "max_results": 5,
                },
            )
            thread_id = start_resp.json()["data"]["thread_id"]

            import asyncio

            await asyncio.sleep(2)

            resp = await client.post(
                f"/api/v1/pipelines/{thread_id}/resume",
                json={"resolved_conflicts": []},
            )
            assert resp.status_code == 400
            assert "not interrupted" in resp.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_cancel_pipeline(self, client, project):
        with patch("app.services.search_service.SearchService.search", new_callable=AsyncMock) as mock_search:

            async def slow_search(*args, **kwargs):
                import asyncio

                await asyncio.sleep(10)
                return {"papers": [], "total": 0}

            mock_search.side_effect = slow_search

            start_resp = await client.post(
                "/api/v1/pipelines/search",
                json={
                    "project_id": project.id,
                    "query": "test",
                    "max_results": 5,
                },
            )
            thread_id = start_resp.json()["data"]["thread_id"]

            cancel_resp = await client.post(f"/api/v1/pipelines/{thread_id}/cancel")
            assert cancel_resp.status_code == 200
            assert cancel_resp.json()["data"]["status"] == "cancelled"
