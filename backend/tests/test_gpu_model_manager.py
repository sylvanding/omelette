"""Tests for GPUModelManager TTL-based model lifecycle."""

from __future__ import annotations

import asyncio
import time
from unittest.mock import patch

import pytest


@pytest.fixture()
def manager():
    from app.services.gpu_model_manager import GPUModelManager

    return GPUModelManager(ttl_seconds=2, check_interval=1)


def test_acquire_loads_model(manager):
    calls = []

    def loader():
        calls.append(1)
        return "fake_model"

    model = manager.acquire("test", loader, model_name="m1", device="cpu")
    assert model == "fake_model"
    assert len(calls) == 1


def test_acquire_returns_cached(manager):
    calls = []

    def loader():
        calls.append(1)
        return "fake_model"

    m1 = manager.acquire("test", loader)
    m2 = manager.acquire("test", loader)
    assert m1 is m2
    assert len(calls) == 1


def test_acquire_force_reload(manager):
    calls = []

    def loader():
        calls.append(1)
        return f"model_{len(calls)}"

    m1 = manager.acquire("test", loader)
    assert m1 == "model_1"

    with patch("app.services.gpu_model_manager.gc"):
        m2 = manager.acquire("test", loader, force_reload=True)
    assert m2 == "model_2"
    assert len(calls) == 2


def test_unload_removes_model(manager):
    manager.acquire("test", lambda: "m")
    assert manager.is_loaded("test")

    with patch("app.services.gpu_model_manager.gc"):
        manager.unload("test")
    assert not manager.is_loaded("test")


def test_unload_all(manager):
    manager.acquire("a", lambda: "m1")
    manager.acquire("b", lambda: "m2")
    assert len(manager.loaded_model_names) == 2

    with patch("app.services.gpu_model_manager.gc"):
        manager.unload_all()
    assert len(manager.loaded_model_names) == 0


def test_touch_updates_timestamp(manager):
    manager.acquire("test", lambda: "m")
    entry = manager._models["test"]
    old_ts = entry.last_used_at
    time.sleep(0.05)
    manager.touch("test")
    assert entry.last_used_at > old_ts


def test_touch_nonexistent_is_noop(manager):
    manager.touch("nonexistent")


def test_get_status_empty(manager):
    assert manager.get_status() == []


def test_get_status_with_models(manager):
    manager.acquire("test", lambda: "m", model_name="TestModel", device="cuda:0")
    status = manager.get_status()
    assert len(status) == 1
    assert status[0]["name"] == "test"
    assert status[0]["model_name"] == "TestModel"
    assert status[0]["loaded"] is True
    assert status[0]["device"] == "cuda:0"
    assert "idle_seconds" in status[0]
    assert "ttl_remaining_seconds" in status[0]


@pytest.mark.asyncio
async def test_ttl_expires_unloads(manager):
    manager.acquire("test", lambda: "m")
    assert manager.is_loaded("test")

    with patch("app.services.gpu_model_manager.gc"):
        await manager.start()
        await asyncio.sleep(3.5)
        await manager.stop()

    assert not manager.is_loaded("test")


@pytest.mark.asyncio
async def test_acquire_resets_ttl(manager):
    manager.acquire("test", lambda: "m")

    with patch("app.services.gpu_model_manager.gc"):
        await manager.start()
        await asyncio.sleep(1.5)
        manager.acquire("test", lambda: "m2")
        await asyncio.sleep(1.5)
        assert manager.is_loaded("test")
        await manager.stop()


def test_ttl_zero_disables_cleanup():
    from app.services.gpu_model_manager import GPUModelManager

    mgr = GPUModelManager(ttl_seconds=0, check_interval=1)
    status = mgr.get_status()
    assert status == []


@pytest.mark.asyncio
async def test_ttl_zero_no_cleanup_task():
    from app.services.gpu_model_manager import GPUModelManager

    mgr = GPUModelManager(ttl_seconds=0, check_interval=1)
    await mgr.start()
    assert mgr._cleanup_task is None
    await mgr.stop()


def test_concurrent_acquire_single_load(manager):
    import threading

    calls = []
    barrier = threading.Barrier(3)

    def loader():
        calls.append(1)
        time.sleep(0.1)
        return "model"

    def worker():
        barrier.wait()
        manager.acquire("shared", loader)

    threads = [threading.Thread(target=worker) for _ in range(3)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(calls) == 1
