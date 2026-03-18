"""GPU model lifecycle manager with TTL-based auto-unloading.

Uses threading locks so that ``acquire`` / ``release`` work from both sync
and async code.  Only the background TTL sweep needs the event loop.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from app.config import settings
from app.services.gpu_utils import release_gpu_memory

logger = logging.getLogger(__name__)


@dataclass
class _ModelEntry:
    model: Any
    last_used_at: float = field(default_factory=time.monotonic)
    model_name: str = ""
    device: str = ""


class GPUModelManager:
    """Manages GPU model lifecycle with TTL-based auto-unloading.

    Models are loaded on-demand via ``acquire()`` and automatically unloaded
    after ``model_ttl_seconds`` of inactivity.  Set ``model_ttl_seconds=0``
    to disable auto-unloading (models persist for the process lifetime).
    """

    def __init__(
        self,
        ttl_seconds: int | None = None,
        check_interval: int | None = None,
    ):
        self._ttl = ttl_seconds if ttl_seconds is not None else settings.model_ttl_seconds
        self._interval = check_interval if check_interval is not None else settings.model_ttl_check_interval
        self._models: dict[str, _ModelEntry] = {}
        self._locks: dict[str, threading.Lock] = {}
        self._global_lock = threading.Lock()
        self._cleanup_task: asyncio.Task[None] | None = None

    # -- lifecycle --------------------------------------------------------

    async def start(self) -> None:
        """Start the background TTL cleanup loop (requires a running event loop)."""
        if self._ttl > 0 and self._cleanup_task is None:
            self._cleanup_task = asyncio.create_task(self._cleanup_loop())
            logger.info("GPU model manager started (TTL=%ds, interval=%ds)", self._ttl, self._interval)

    async def stop(self) -> None:
        """Cancel the cleanup loop and unload all models."""
        if self._cleanup_task is not None:
            self._cleanup_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._cleanup_task
            self._cleanup_task = None
        self.unload_all()
        logger.info("GPU model manager stopped")

    # -- model access (sync-safe) -----------------------------------------

    def _get_lock(self, name: str) -> threading.Lock:
        with self._global_lock:
            if name not in self._locks:
                self._locks[name] = threading.Lock()
            return self._locks[name]

    def acquire(
        self,
        name: str,
        loader_fn: Callable[[], Any],
        *,
        model_name: str = "",
        device: str = "",
        force_reload: bool = False,
    ) -> Any:
        """Return a cached model or load it on demand (thread-safe, sync).

        Concurrent callers for the same *name* block on a shared lock so
        the loader runs at most once.
        """
        lock = self._get_lock(name)
        with lock:
            entry = self._models.get(name)

            if entry is not None and not force_reload:
                entry.last_used_at = time.monotonic()
                return entry.model

            if entry is not None:
                self._do_unload(name, entry)

            model = loader_fn()
            self._models[name] = _ModelEntry(
                model=model,
                model_name=model_name,
                device=device,
            )
            logger.info("Loaded GPU model %r (model=%s, device=%s)", name, model_name, device)
            return model

    def touch(self, name: str) -> None:
        """Update the last-used timestamp for a loaded model."""
        entry = self._models.get(name)
        if entry is not None:
            entry.last_used_at = time.monotonic()

    def unload(self, name: str) -> None:
        """Unload a single model by name."""
        lock = self._get_lock(name)
        with lock:
            entry = self._models.pop(name, None)
            if entry is not None:
                self._do_unload(name, entry)

    def unload_all(self) -> None:
        """Unload all managed models."""
        names = list(self._models.keys())
        for name in names:
            self.unload(name)

    def is_loaded(self, name: str) -> bool:
        return name in self._models

    # -- internals --------------------------------------------------------

    def _do_unload(self, name: str, entry: _ModelEntry) -> None:
        logger.info("Unloading GPU model %r", name)
        del entry.model
        release_gpu_memory(caller=f"gpu_model_manager:{name}")

    async def _cleanup_loop(self) -> None:
        """Periodically check for idle models and unload them."""
        while True:
            await asyncio.sleep(self._interval)
            now = time.monotonic()
            expired = [name for name, entry in self._models.items() if (now - entry.last_used_at) > self._ttl]
            for name in expired:
                logger.info("TTL expired for model %r, unloading", name)
                self.unload(name)

    # -- status -----------------------------------------------------------

    def get_status(self) -> list[dict[str, Any]]:
        """Return status information for all managed models."""
        now = time.monotonic()
        result = []
        for name, entry in self._models.items():
            idle = now - entry.last_used_at
            result.append(
                {
                    "name": name,
                    "model_name": entry.model_name,
                    "loaded": True,
                    "device": entry.device,
                    "idle_seconds": round(idle, 1),
                    "ttl_remaining_seconds": max(0, round(self._ttl - idle, 1)) if self._ttl > 0 else None,
                }
            )
        return result

    @property
    def loaded_model_names(self) -> list[str]:
        return list(self._models.keys())


gpu_model_manager = GPUModelManager()
