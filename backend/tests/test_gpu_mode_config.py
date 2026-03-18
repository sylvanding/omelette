"""Tests for GPU_MODE preset system and per-service config resolution."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from app.config import GPU_MODE_PRESETS, GpuMode, Settings
from app.services.paper_processor import _parse_ocr_gpu_ids, _resolve_parallel_limit


class TestGpuModePresets:
    """Verify the three preset modes fill correct defaults."""

    def test_conservative_defaults(self):
        with patch.dict("os.environ", {"GPU_MODE": "conservative"}, clear=False):
            s = Settings(_env_file=None)
        assert s.gpu_mode == GpuMode.CONSERVATIVE
        assert s.embed_batch_size == 1
        assert s.rerank_batch_size == 1
        assert s.ocr_parallel_limit == 1
        assert s.reranker_concurrency_limit == 1

    def test_balanced_defaults(self):
        with patch.dict("os.environ", {"GPU_MODE": "balanced"}, clear=False):
            s = Settings(_env_file=None)
        assert s.gpu_mode == GpuMode.BALANCED
        assert s.embed_batch_size == 8
        assert s.rerank_batch_size == 16

    def test_aggressive_defaults(self):
        with patch.dict("os.environ", {"GPU_MODE": "aggressive"}, clear=False):
            s = Settings(_env_file=None)
        assert s.gpu_mode == GpuMode.AGGRESSIVE
        assert s.embed_batch_size == 32
        assert s.rerank_batch_size == 50
        assert s.reranker_concurrency_limit == 2


class TestUserOverride:
    """User-set values take priority over GPU_MODE presets."""

    def test_override_embed_batch(self):
        with patch.dict("os.environ", {"GPU_MODE": "conservative", "EMBED_BATCH_SIZE": "16"}, clear=False):
            s = Settings(_env_file=None)
        assert s.embed_batch_size == 16
        assert s.rerank_batch_size == 1

    def test_override_rerank_batch(self):
        with patch.dict("os.environ", {"GPU_MODE": "aggressive", "RERANK_BATCH_SIZE": "8"}, clear=False):
            s = Settings(_env_file=None)
        assert s.rerank_batch_size == 8
        assert s.embed_batch_size == 32

    def test_override_ocr_parallel(self):
        with patch.dict("os.environ", {"GPU_MODE": "conservative", "OCR_PARALLEL_LIMIT": "4"}, clear=False):
            s = Settings(_env_file=None)
        assert s.ocr_parallel_limit == 4


class TestGpuPinDefaults:
    """GPU pin fields default to -1 (auto)."""

    def test_auto_defaults(self):
        s = Settings(_env_file=None)
        assert s.embed_gpu_id == -1
        assert s.rerank_gpu_id == -1
        assert s.ocr_gpu_ids == ""

    def test_explicit_pin(self):
        with patch.dict("os.environ", {"EMBED_GPU_ID": "0", "RERANK_GPU_ID": "1"}, clear=False):
            s = Settings(_env_file=None)
        assert s.embed_gpu_id == 0
        assert s.rerank_gpu_id == 1


class TestPresetCompleteness:
    """Every preset defines all required keys."""

    @pytest.mark.parametrize("mode", list(GpuMode))
    def test_all_keys_present(self, mode: GpuMode):
        preset = GPU_MODE_PRESETS[mode]
        expected_keys = {"ocr_parallel_limit", "embed_batch_size", "rerank_batch_size", "reranker_concurrency_limit"}
        assert set(preset.keys()) == expected_keys


class TestParseOcrGpuIds:
    """Verify OCR_GPU_IDS parsing."""

    def test_empty_string_uses_all(self):
        with patch("app.services.paper_processor.settings") as mock_settings:
            mock_settings.ocr_gpu_ids = ""
            result = _parse_ocr_gpu_ids(3)
        assert result == [0, 1, 2]

    def test_single_id(self):
        with patch("app.services.paper_processor.settings") as mock_settings:
            mock_settings.ocr_gpu_ids = "1"
            result = _parse_ocr_gpu_ids(3)
        assert result == [1]

    def test_multiple_ids(self):
        with patch("app.services.paper_processor.settings") as mock_settings:
            mock_settings.ocr_gpu_ids = "0,2"
            result = _parse_ocr_gpu_ids(3)
        assert result == [0, 2]

    def test_out_of_range_filtered(self):
        with patch("app.services.paper_processor.settings") as mock_settings:
            mock_settings.ocr_gpu_ids = "0,5,1"
            result = _parse_ocr_gpu_ids(3)
        assert result == [0, 1]

    def test_all_invalid_falls_back(self):
        with patch("app.services.paper_processor.settings") as mock_settings:
            mock_settings.ocr_gpu_ids = "10,20"
            result = _parse_ocr_gpu_ids(3)
        assert result == [0, 1, 2]

    def test_cpu_only(self):
        with patch("app.services.paper_processor.settings") as mock_settings:
            mock_settings.ocr_gpu_ids = ""
            result = _parse_ocr_gpu_ids(0)
        assert result == [0]


class TestResolveParallelLimitAggressiveMode:
    """Aggressive mode doubles the auto parallel limit."""

    def test_aggressive_doubles(self):
        with patch("app.services.paper_processor.settings") as mock_settings:
            mock_settings.ocr_parallel_limit = 0
            mock_settings.gpu_mode = GpuMode.AGGRESSIVE
            assert _resolve_parallel_limit(2) == 4

    def test_balanced_no_double(self):
        with patch("app.services.paper_processor.settings") as mock_settings:
            mock_settings.ocr_parallel_limit = 0
            mock_settings.gpu_mode = GpuMode.BALANCED
            assert _resolve_parallel_limit(2) == 2

    def test_explicit_override_ignores_mode(self):
        with patch("app.services.paper_processor.settings") as mock_settings:
            mock_settings.ocr_parallel_limit = 3
            mock_settings.gpu_mode = GpuMode.AGGRESSIVE
            assert _resolve_parallel_limit(2) == 3
