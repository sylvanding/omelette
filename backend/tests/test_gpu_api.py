"""Tests for GPU monitoring API endpoints."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture()
def mock_managers():
    with (
        patch("app.services.gpu_model_manager.gpu_model_manager") as mock_gpu,
        patch("app.services.mineru_process_manager.mineru_process_manager") as mock_mineru,
    ):
        mock_gpu.get_status.return_value = []
        mock_gpu.loaded_model_names = []
        mock_gpu.unload_all.return_value = None
        mock_mineru.get_status.return_value = {
            "status": "stopped",
            "pid": None,
            "port": 8010,
        }
        yield mock_gpu, mock_mineru


@pytest.mark.asyncio
async def test_gpu_status_no_models(mock_managers):
    mock_gpu, mock_mineru = mock_managers
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/gpu/status")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["models"] == []
    assert data["mineru"]["status"] == "stopped"


@pytest.mark.asyncio
async def test_gpu_status_with_models(mock_managers):
    mock_gpu, _ = mock_managers
    mock_gpu.get_status.return_value = [
        {
            "name": "embedding",
            "model_name": "Qwen/Qwen3-Embedding-0.6B",
            "loaded": True,
            "device": "cuda:0",
            "idle_seconds": 30.5,
            "ttl_remaining_seconds": 269.5,
        }
    ]
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/gpu/status")
    assert resp.status_code == 200
    models = resp.json()["data"]["models"]
    assert len(models) == 1
    assert models[0]["name"] == "embedding"
    assert models[0]["loaded"] is True


@pytest.mark.asyncio
async def test_gpu_status_mineru_running(mock_managers):
    _, mock_mineru = mock_managers
    mock_mineru.get_status.return_value = {
        "status": "running",
        "pid": 12345,
        "port": 8010,
        "idle_seconds": 10.0,
        "ttl_remaining_seconds": 590.0,
    }
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/gpu/status")
    assert resp.status_code == 200
    mineru = resp.json()["data"]["mineru"]
    assert mineru["status"] == "running"
    assert mineru["pid"] == 12345


@pytest.mark.asyncio
async def test_gpu_unload(mock_managers):
    mock_gpu, _ = mock_managers
    mock_gpu.loaded_model_names = ["embedding", "reranker"]
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/api/v1/gpu/unload")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert "unloaded" in data
    mock_gpu.unload_all.assert_called_once()


@pytest.mark.asyncio
async def test_gpu_unload_empty(mock_managers):
    mock_gpu, _ = mock_managers
    mock_gpu.loaded_model_names = []
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/api/v1/gpu/unload")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["unloaded"] == []
