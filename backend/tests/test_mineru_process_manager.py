"""Tests for MinerUProcessManager subprocess lifecycle."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.fixture()
def _disable_auto_manage():
    with patch("app.services.mineru_process_manager.settings") as mock_settings:
        mock_settings.mineru_auto_manage = False
        mock_settings.mineru_ttl_seconds = 600
        mock_settings.mineru_api_url = "http://localhost:8010"
        mock_settings.mineru_conda_env = "mineru"
        mock_settings.mineru_startup_timeout = 10
        mock_settings.mineru_gpu_ids = ""
        mock_settings.cuda_visible_devices = "6,7"
        yield mock_settings


@pytest.fixture()
def _enable_auto_manage():
    with patch("app.services.mineru_process_manager.settings") as mock_settings:
        mock_settings.mineru_auto_manage = True
        mock_settings.mineru_ttl_seconds = 600
        mock_settings.mineru_api_url = "http://localhost:8010"
        mock_settings.mineru_conda_env = "mineru"
        mock_settings.mineru_startup_timeout = 5
        mock_settings.mineru_gpu_ids = ""
        mock_settings.cuda_visible_devices = "6,7"
        yield mock_settings


@pytest.fixture()
def manager():
    from app.services.mineru_process_manager import MinerUProcessManager

    return MinerUProcessManager()


@pytest.mark.asyncio
async def test_auto_manage_false_skips(manager, _disable_auto_manage):
    result = await manager.ensure_running()
    assert result is False


@pytest.mark.asyncio
async def test_ensure_running_detects_external(manager, _enable_auto_manage):
    with patch.object(manager, "_health_check", new_callable=AsyncMock, return_value=True):
        result = await manager.ensure_running()
    assert result is True
    assert manager._is_external is True


@pytest.mark.asyncio
async def test_ensure_running_starts_subprocess(manager, _enable_auto_manage):
    health_results = [False, False, True]

    async def mock_health(*args, **kwargs):
        return health_results.pop(0) if health_results else True

    with (
        patch.object(manager, "_health_check", side_effect=mock_health),
        patch.object(manager, "_start_subprocess", return_value=True) as mock_start,
    ):
        mock_process = MagicMock()
        mock_process.poll.return_value = None
        manager._process = mock_process

        result = await manager.ensure_running()

    assert result is True
    mock_start.assert_called_once()


@pytest.mark.asyncio
async def test_start_failure_returns_false(manager, _enable_auto_manage):
    with (
        patch.object(manager, "_health_check", new_callable=AsyncMock, return_value=False),
        patch.object(manager, "_start_subprocess", return_value=False),
    ):
        result = await manager.ensure_running()
    assert result is False


def test_get_status_stopped(manager):
    status = manager.get_status()
    assert status["status"] == "stopped"
    assert status["pid"] is None


def test_get_status_running(manager):
    mock_process = MagicMock()
    mock_process.poll.return_value = None
    mock_process.pid = 12345
    manager._process = mock_process
    manager._last_used_at = 1000.0

    with patch("time.monotonic", return_value=1050.0):
        status = manager.get_status()

    assert status["status"] == "running"
    assert status["pid"] == 12345


def test_get_status_external(manager):
    manager._is_external = True
    status = manager.get_status()
    assert status["status"] == "external"


@pytest.mark.asyncio
async def test_stop_kills_subprocess(manager):
    mock_process = MagicMock()
    mock_process.poll.return_value = None
    mock_process.pid = 99999
    mock_process.wait.return_value = 0
    manager._process = mock_process

    await manager._kill_process()

    mock_process.send_signal.assert_called_once()
    assert manager._process is None


@pytest.mark.asyncio
async def test_start_stop_lifecycle(manager, _enable_auto_manage):
    await manager.start()
    assert manager._cleanup_task is not None
    await manager.stop()
    assert manager._cleanup_task is None


def test_touch_updates_timestamp(manager):
    manager._last_used_at = 0.0
    manager.touch()
    assert manager._last_used_at > 0.0


def test_start_subprocess_no_conda(manager):
    with patch("shutil.which", return_value=None):
        result = manager._start_subprocess()
    assert result is False
