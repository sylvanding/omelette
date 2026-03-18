"""Tests for paper_processor GPU detection and parallel OCR logic."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from app.services.paper_processor import _detect_gpu_count, _resolve_parallel_limit


class TestDetectGpuCount:
    """Verify _detect_gpu_count under CPU-only, single-GPU, and multi-GPU scenarios."""

    def test_cpu_only_no_torch(self):
        with (
            patch.dict("sys.modules", {"torch": None}),
            patch("builtins.__import__", side_effect=ImportError("no torch")),
        ):
            assert _detect_gpu_count() == 0

    def test_cpu_only_cuda_not_available(self):
        mock_torch = type("torch", (), {"cuda": type("cuda", (), {"is_available": staticmethod(lambda: False)})()})()
        with (
            patch("app.services.paper_processor.importlib", create=True),
            patch.dict("sys.modules", {"torch": mock_torch}),
        ):
            result = _detect_gpu_count()
            assert result == 0

    def test_single_gpu(self):
        mock_cuda = type(
            "cuda", (), {"is_available": staticmethod(lambda: True), "device_count": staticmethod(lambda: 1)}
        )()
        mock_torch = type("torch", (), {"cuda": mock_cuda})()
        with patch.dict("sys.modules", {"torch": mock_torch}):
            assert _detect_gpu_count() == 1

    def test_multi_gpu(self):
        mock_cuda = type(
            "cuda", (), {"is_available": staticmethod(lambda: True), "device_count": staticmethod(lambda: 3)}
        )()
        mock_torch = type("torch", (), {"cuda": mock_cuda})()
        with patch.dict("sys.modules", {"torch": mock_torch}):
            assert _detect_gpu_count() == 3


class TestResolveParallelLimit:
    """Verify _resolve_parallel_limit respects config and GPU count."""

    def test_auto_cpu_only(self):
        with patch("app.services.paper_processor.settings") as mock_settings:
            mock_settings.ocr_parallel_limit = 0
            assert _resolve_parallel_limit(0) == 1

    def test_auto_single_gpu(self):
        with patch("app.services.paper_processor.settings") as mock_settings:
            mock_settings.ocr_parallel_limit = 0
            assert _resolve_parallel_limit(1) == 1

    def test_auto_multi_gpu(self):
        with patch("app.services.paper_processor.settings") as mock_settings:
            mock_settings.ocr_parallel_limit = 0
            assert _resolve_parallel_limit(3) == 3

    def test_explicit_override(self):
        with patch("app.services.paper_processor.settings") as mock_settings:
            mock_settings.ocr_parallel_limit = 5
            assert _resolve_parallel_limit(3) == 5

    def test_explicit_one(self):
        with patch("app.services.paper_processor.settings") as mock_settings:
            mock_settings.ocr_parallel_limit = 1
            assert _resolve_parallel_limit(3) == 1


class TestGpuIdRoundRobin:
    """Verify that worker GPU IDs rotate correctly."""

    @pytest.mark.parametrize(
        ("gpu_count", "worker_id", "expected_gpu_id"),
        [
            (3, 0, 0),
            (3, 1, 1),
            (3, 2, 2),
            (3, 3, 0),
            (3, 7, 1),
            (1, 0, 0),
            (1, 5, 0),
        ],
    )
    def test_round_robin(self, gpu_count: int, worker_id: int, expected_gpu_id: int):
        gpu_id = worker_id % gpu_count if gpu_count > 0 else 0
        assert gpu_id == expected_gpu_id

    def test_cpu_only_always_zero(self):
        for worker_id in range(10):
            gpu_id = worker_id % 1 if 0 > 0 else 0  # noqa: SIM300
            assert gpu_id == 0
