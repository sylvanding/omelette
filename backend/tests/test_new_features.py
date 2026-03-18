"""Tests for batch delete, pipelines list, export/import, WebSocket manager, schema validation."""

from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

import app.models  # noqa: F401
from app.database import Base, engine
from app.main import app
from app.websocket.manager import PipelineConnectionManager


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
    resp = await client.post("/api/v1/projects", json={"name": "Test Project", "domain": "optics"})
    assert resp.status_code == 201
    return resp.json()["data"]["id"]


@pytest.mark.asyncio
async def test_batch_delete_papers(client: AsyncClient, project_id: int):
    for i in range(5):
        await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={"title": f"Paper {i}", "abstract": f"Abstract {i}"},
        )
    list_resp = await client.get(f"/api/v1/projects/{project_id}/papers")
    papers = list_resp.json()["data"]["items"]
    ids_to_delete = [p["id"] for p in papers[:3]]

    resp = await client.post(
        f"/api/v1/projects/{project_id}/papers/batch-delete",
        json={"paper_ids": ids_to_delete},
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["deleted"] == 3
    assert data["requested"] == 3

    list_resp2 = await client.get(f"/api/v1/projects/{project_id}/papers")
    assert list_resp2.json()["data"]["total"] == 2


@pytest.mark.asyncio
async def test_batch_delete_nonexistent_ids(client: AsyncClient, project_id: int):
    resp = await client.post(
        f"/api/v1/projects/{project_id}/papers/batch-delete",
        json={"paper_ids": [99999, 99998]},
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["deleted"] == 0
    assert data["requested"] == 2


@pytest.mark.asyncio
async def test_list_pipelines_empty(client: AsyncClient):
    from app.api.v1 import pipelines

    pipelines._running_tasks.clear()
    resp = await client.get("/api/v1/pipelines")
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 200
    assert body["data"] == []


@pytest.mark.asyncio
async def test_list_pipelines_returns_data(client: AsyncClient, project_id: int):
    from app.api.v1 import pipelines

    pipelines._running_tasks["mock_thread_123"] = {
        "status": "running",
        "task_id": 1,
    }
    try:
        resp = await client.get("/api/v1/pipelines")
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 200
        assert len(body["data"]) == 1
        assert body["data"][0]["thread_id"] == "mock_thread_123"
        assert body["data"][0]["status"] == "running"
    finally:
        pipelines._running_tasks.pop("mock_thread_123", None)


@pytest.mark.asyncio
async def test_export_project(client: AsyncClient, project_id: int):
    await client.post(
        f"/api/v1/projects/{project_id}/papers",
        json={"title": "Exported Paper", "abstract": "Abstract", "year": 2024, "journal": "Nature"},
    )
    await client.post(
        f"/api/v1/projects/{project_id}/keywords",
        json={"term": "quantum", "term_en": "quantum", "level": 1, "category": "topic"},
    )

    resp = await client.get(f"/api/v1/projects/{project_id}/export")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert "name" in data
    assert "papers" in data
    assert "keywords" in data
    assert "subscriptions" in data
    assert len(data["papers"]) == 1
    assert data["papers"][0]["title"] == "Exported Paper"
    assert len(data["keywords"]) == 1
    assert data["keywords"][0]["term"] == "quantum"


@pytest.mark.asyncio
async def test_import_project(client: AsyncClient):
    payload = {
        "name": "Imported Project",
        "description": "Test import",
        "domain": "physics",
        "papers": [
            {"title": "Paper 1", "abstract": "Abstract 1", "year": 2024, "journal": "Nature"},
            {"title": "Paper 2", "abstract": "Abstract 2", "year": 2023, "journal": "Science"},
        ],
        "keywords": [{"term": "quantum", "term_en": "quantum", "level": 1, "category": "topic", "synonyms": ""}],
        "subscriptions": [],
    }
    resp = await client.post("/api/v1/projects/import", json=payload)
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["name"] == "Imported Project"
    assert data["paper_count"] == 2
    assert data["keyword_count"] == 1

    list_resp = await client.get(f"/api/v1/projects/{data['id']}/papers")
    papers = list_resp.json()["data"]["items"]
    assert len(papers) == 2
    titles = {p["title"] for p in papers}
    assert "Paper 1" in titles
    assert "Paper 2" in titles


@pytest.mark.asyncio
async def test_pipeline_connection_manager_connect_disconnect():
    manager = PipelineConnectionManager()
    ws = AsyncMock()
    ws.accept = AsyncMock()

    await manager.connect(ws, "room_1")
    ws.accept.assert_called_once()
    assert "room_1" in manager.rooms
    assert ws in manager.rooms["room_1"]

    manager.disconnect(ws, "room_1")
    assert "room_1" not in manager.rooms or ws not in manager.rooms.get("room_1", set())


@pytest.mark.asyncio
async def test_pipeline_connection_manager_broadcast():
    manager = PipelineConnectionManager()
    ws1 = AsyncMock()
    ws1.accept = AsyncMock()
    ws2 = AsyncMock()
    ws2.accept = AsyncMock()

    await manager.connect(ws1, "room_broadcast")
    await manager.connect(ws2, "room_broadcast")

    await manager.broadcast_to_room("room_broadcast", {"type": "status", "value": 42})
    ws1.send_json.assert_called_once_with({"type": "status", "value": 42})
    ws2.send_json.assert_called_once_with({"type": "status", "value": 42})


@pytest.mark.asyncio
async def test_paper_year_out_of_range(client: AsyncClient, project_id: int):
    resp = await client.post(
        f"/api/v1/projects/{project_id}/papers",
        json={"title": "Test Paper", "year": 1000},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_paper_title_too_long(client: AsyncClient, project_id: int):
    resp = await client.post(
        f"/api/v1/projects/{project_id}/papers",
        json={"title": "x" * 3000},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_subscription_invalid_frequency(client: AsyncClient, project_id: int):
    resp = await client.post(
        f"/api/v1/projects/{project_id}/subscriptions",
        json={"name": "Test", "frequency": "hourly"},
    )
    assert resp.status_code == 422
