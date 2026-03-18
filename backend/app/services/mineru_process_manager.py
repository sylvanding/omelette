"""MinerU subprocess lifecycle manager with TTL-based auto-stop."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import shutil
import signal
import subprocess
import time
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class MinerUProcessManager:
    """Manages a MinerU FastAPI subprocess, starting it on demand and
    stopping it after a configurable idle period.

    When ``mineru_auto_manage`` is ``False`` the manager is a no-op —
    callers should use the existing ``MinerUClient`` / health-check flow.
    """

    def __init__(self) -> None:
        self._process: subprocess.Popen[bytes] | None = None
        self._lock = asyncio.Lock()
        self._last_used_at: float = 0.0
        self._cleanup_task: asyncio.Task[None] | None = None
        self._is_external: bool = False

    # -- lifecycle --------------------------------------------------------

    async def start(self) -> None:
        """Start the background TTL watcher (does NOT start MinerU yet)."""
        if not settings.mineru_auto_manage:
            logger.info("MinerU auto-manage disabled")
            return
        ttl = settings.mineru_ttl_seconds
        if ttl > 0 and self._cleanup_task is None:
            self._cleanup_task = asyncio.create_task(self._cleanup_loop())
            logger.info("MinerU process manager started (TTL=%ds)", ttl)

    async def stop(self) -> None:
        """Cancel the watcher and kill the subprocess (if we own it)."""
        if self._cleanup_task is not None:
            self._cleanup_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._cleanup_task
            self._cleanup_task = None
        await self._kill_process()
        logger.info("MinerU process manager stopped")

    # -- public API -------------------------------------------------------

    async def ensure_running(self) -> bool:
        """Make sure MinerU is reachable.  Returns ``True`` on success.

        1. If an external process already serves the port → use it.
        2. Otherwise start a subprocess via ``conda run``.
        3. Poll ``/docs`` until healthy or timeout.
        """
        if not settings.mineru_auto_manage:
            return False

        async with self._lock:
            if await self._health_check():
                self._touch()
                if self._process is None:
                    self._is_external = True
                return True

            self._is_external = False
            if not self._start_subprocess():
                return False

            ok = await self._wait_healthy(settings.mineru_startup_timeout)
            if ok:
                self._touch()
            else:
                logger.warning("MinerU failed to become healthy within %ds", settings.mineru_startup_timeout)
                await self._kill_process()
            return ok

    def touch(self) -> None:
        """Update idle timer (call after every MinerU request)."""
        self._touch()

    async def shutdown_mineru(self) -> None:
        """Immediately stop the managed subprocess."""
        async with self._lock:
            await self._kill_process()

    def get_status(self) -> dict[str, Any]:
        now = time.monotonic()
        if self._process is not None and self._process.poll() is None:
            idle = now - self._last_used_at if self._last_used_at else 0
            ttl = settings.mineru_ttl_seconds
            return {
                "status": "running",
                "pid": self._process.pid,
                "port": self._port,
                "idle_seconds": round(idle, 1),
                "ttl_remaining_seconds": max(0, round(ttl - idle, 1)) if ttl > 0 else None,
            }
        if self._is_external:
            return {"status": "external", "pid": None, "port": self._port}
        return {"status": "stopped", "pid": None, "port": self._port}

    # -- internals --------------------------------------------------------

    @property
    def _port(self) -> int:
        url = settings.mineru_api_url.rstrip("/")
        try:
            return int(url.rsplit(":", 1)[-1])
        except (ValueError, IndexError):
            return 8010

    @property
    def _host(self) -> str:
        url = settings.mineru_api_url.rstrip("/")
        return url.rsplit(":", 1)[0].split("//")[-1] if "//" in url else "0.0.0.0"

    def _touch(self) -> None:
        self._last_used_at = time.monotonic()

    async def _health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(f"{settings.mineru_api_url.rstrip('/')}/docs")
                return resp.status_code == 200
        except Exception:
            return False

    def _start_subprocess(self) -> bool:
        conda_path = shutil.which("conda")
        if not conda_path:
            logger.warning("conda not found on PATH, cannot auto-start MinerU")
            return False

        gpu_ids = settings.mineru_gpu_ids or settings.cuda_visible_devices
        env_name = settings.mineru_conda_env

        cmd = [
            conda_path,
            "run",
            "-n",
            env_name,
            "python",
            "-m",
            "mineru.cli.fast_api",
            "--host",
            self._host,
            "--port",
            str(self._port),
        ]

        import os

        env = os.environ.copy()
        if gpu_ids:
            env["CUDA_VISIBLE_DEVICES"] = gpu_ids

        try:
            self._process = subprocess.Popen(
                cmd,
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
            )
            logger.info(
                "Started MinerU subprocess pid=%d (env=%s, gpu=%s, port=%d)",
                self._process.pid,
                env_name,
                gpu_ids,
                self._port,
            )
            return True
        except (OSError, FileNotFoundError) as exc:
            logger.warning("Failed to start MinerU subprocess: %s", exc)
            return False

    async def _wait_healthy(self, timeout: int) -> bool:
        deadline = time.monotonic() + timeout
        interval = 2.0
        while time.monotonic() < deadline:
            if self._process is not None and self._process.poll() is not None:
                stderr_data = await asyncio.to_thread(self._process.stderr.read)
                stderr = (stderr_data or b"").decode(errors="replace")[:500]
                logger.warning("MinerU process exited early (code=%s): %s", self._process.returncode, stderr)
                return False
            if await self._health_check():
                return True
            await asyncio.sleep(interval)
            interval = min(interval * 1.5, 10.0)
        return False

    async def _kill_process(self) -> None:
        if self._process is None:
            return
        if self._process.poll() is not None:
            self._process = None
            return

        pid = self._process.pid
        logger.info("Stopping MinerU subprocess pid=%d", pid)
        try:
            self._process.send_signal(signal.SIGTERM)
            try:
                await asyncio.to_thread(self._process.wait, 10)
            except subprocess.TimeoutExpired:
                logger.warning("MinerU pid=%d did not exit after SIGTERM, sending SIGKILL", pid)
                self._process.kill()
                await asyncio.to_thread(self._process.wait, 5)
        except (OSError, ProcessLookupError):
            pass
        finally:
            self._process = None

    async def _cleanup_loop(self) -> None:
        ttl = settings.mineru_ttl_seconds
        interval = max(ttl // 4, 30)
        while True:
            await asyncio.sleep(interval)
            if self._process is None or self._is_external:
                continue
            if self._process.poll() is not None:
                logger.info("MinerU subprocess exited unexpectedly")
                self._process = None
                continue
            idle = time.monotonic() - self._last_used_at
            if self._last_used_at > 0 and idle > ttl:
                logger.info("MinerU idle for %.0fs (TTL=%ds), stopping", idle, ttl)
                await self._kill_process()


mineru_process_manager = MinerUProcessManager()
