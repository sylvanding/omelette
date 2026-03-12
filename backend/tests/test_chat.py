"""Tests for Conversation CRUD API endpoints.

Chat streaming tests are in test_chat_pipeline.py.
"""

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


# --- Conversation CRUD tests ---


@pytest.mark.asyncio
async def test_create_conversation(client: AsyncClient):
    resp = await client.post(
        "/api/v1/conversations",
        json={"title": "Test Chat", "knowledge_base_ids": [1], "tool_mode": "qa"},
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["title"] == "Test Chat"
    assert data["knowledge_base_ids"] == [1]
    assert data["tool_mode"] == "qa"


@pytest.mark.asyncio
async def test_list_conversations(client: AsyncClient):
    await client.post("/api/v1/conversations", json={"title": "A"})
    await client.post("/api/v1/conversations", json={"title": "B"})

    resp = await client.get("/api/v1/conversations")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["total"] == 2
    assert len(data["items"]) == 2


@pytest.mark.asyncio
async def test_get_conversation(client: AsyncClient):
    create_resp = await client.post("/api/v1/conversations", json={"title": "Detail"})
    conv_id = create_resp.json()["data"]["id"]

    resp = await client.get(f"/api/v1/conversations/{conv_id}")
    assert resp.status_code == 200
    assert resp.json()["data"]["title"] == "Detail"
    assert resp.json()["data"]["messages"] == []


@pytest.mark.asyncio
async def test_get_conversation_not_found(client: AsyncClient):
    resp = await client.get("/api/v1/conversations/99999")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_conversation(client: AsyncClient):
    create_resp = await client.post("/api/v1/conversations", json={"title": "Old"})
    conv_id = create_resp.json()["data"]["id"]

    resp = await client.put(f"/api/v1/conversations/{conv_id}", json={"title": "New"})
    assert resp.status_code == 200
    assert resp.json()["data"]["title"] == "New"


@pytest.mark.asyncio
async def test_delete_conversation(client: AsyncClient):
    create_resp = await client.post("/api/v1/conversations", json={"title": "Deleteme"})
    conv_id = create_resp.json()["data"]["id"]

    resp = await client.delete(f"/api/v1/conversations/{conv_id}")
    assert resp.status_code == 200
    assert resp.json()["data"]["deleted"] is True

    resp2 = await client.get(f"/api/v1/conversations/{conv_id}")
    assert resp2.status_code == 404
