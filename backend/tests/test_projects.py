"""Tests for Project CRUD API endpoints."""

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


@pytest.mark.asyncio
async def test_list_projects_empty(client: AsyncClient):
    resp = await client.get("/api/v1/projects")
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 200
    assert body["data"]["items"] == []
    assert body["data"]["total"] == 0


@pytest.mark.asyncio
async def test_create_project(client: AsyncClient):
    resp = await client.post(
        "/api/v1/projects",
        json={
            "name": "Super-Resolution Microscopy",
            "description": "Literature review for SRM techniques",
            "domain": "optics",
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["code"] == 201
    assert body["data"]["name"] == "Super-Resolution Microscopy"
    assert body["data"]["id"] > 0


@pytest.mark.asyncio
async def test_get_project(client: AsyncClient):
    create_resp = await client.post("/api/v1/projects", json={"name": "Test Project"})
    project_id = create_resp.json()["data"]["id"]

    resp = await client.get(f"/api/v1/projects/{project_id}")
    assert resp.status_code == 200
    assert resp.json()["data"]["name"] == "Test Project"


@pytest.mark.asyncio
async def test_update_project(client: AsyncClient):
    create_resp = await client.post("/api/v1/projects", json={"name": "Old Name"})
    project_id = create_resp.json()["data"]["id"]

    resp = await client.put(f"/api/v1/projects/{project_id}", json={"name": "New Name"})
    assert resp.status_code == 200
    assert resp.json()["data"]["name"] == "New Name"


@pytest.mark.asyncio
async def test_delete_project(client: AsyncClient):
    create_resp = await client.post("/api/v1/projects", json={"name": "To Delete"})
    project_id = create_resp.json()["data"]["id"]

    resp = await client.delete(f"/api/v1/projects/{project_id}")
    assert resp.status_code == 200

    resp = await client.get(f"/api/v1/projects/{project_id}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_nonexistent_project(client: AsyncClient):
    resp = await client.get("/api/v1/projects/99999")
    assert resp.status_code == 404
