"""Tests for reranker_service — model loading, caching, and async inference."""

from unittest.mock import MagicMock, patch

import pytest


class TestGetReranker:
    @patch("app.services.reranker_service._load_reranker")
    def test_returns_cached_instance(self, mock_load):
        mock_load.cache_clear()
        from app.services.reranker_service import get_reranker

        sentinel = MagicMock()
        mock_load.return_value = sentinel
        result = get_reranker()
        assert result is sentinel
        mock_load.assert_called_once()

    @patch("app.services.reranker_service._load_reranker")
    def test_uses_settings_model_name(self, mock_load):
        mock_load.cache_clear()
        from app.config import settings
        from app.services.reranker_service import get_reranker

        get_reranker()
        mock_load.assert_called_with(settings.reranker_model)

    @patch("app.services.reranker_service._load_reranker")
    def test_custom_model_name(self, mock_load):
        mock_load.cache_clear()
        from app.services.reranker_service import get_reranker

        get_reranker(model_name="custom/reranker")
        mock_load.assert_called_with("custom/reranker")


class TestRerankNodes:
    @pytest.mark.asyncio
    async def test_empty_nodes_returns_empty(self):
        from app.services.reranker_service import rerank_nodes

        result = await rerank_nodes([], "test query", top_n=5)
        assert result == []

    @pytest.mark.asyncio
    @patch("app.services.reranker_service.get_reranker")
    async def test_rerank_returns_top_n(self, mock_get_reranker):
        from app.services.reranker_service import rerank_nodes

        mock_node_1 = MagicMock()
        mock_node_1.score = 0.9
        mock_node_2 = MagicMock()
        mock_node_2.score = 0.5
        mock_node_3 = MagicMock()
        mock_node_3.score = 0.7

        mock_reranker = MagicMock()
        mock_reranker.postprocess_nodes.return_value = [mock_node_1, mock_node_3, mock_node_2]
        mock_get_reranker.return_value = mock_reranker

        result = await rerank_nodes([mock_node_1, mock_node_2, mock_node_3], "query", top_n=2)
        assert len(result) == 2
        assert result[0] is mock_node_1

    @pytest.mark.asyncio
    @patch("app.services.reranker_service.get_reranker", side_effect=ImportError("no model"))
    async def test_fallback_on_import_error(self, _mock):
        from app.services.reranker_service import rerank_nodes

        nodes = [MagicMock() for _ in range(5)]
        result = await rerank_nodes(nodes, "query", top_n=3)
        assert len(result) == 3
        assert result == nodes[:3]

    @pytest.mark.asyncio
    @patch("app.services.reranker_service.get_reranker", side_effect=RuntimeError("GPU error"))
    async def test_fallback_on_runtime_error(self, _mock):
        from app.services.reranker_service import rerank_nodes

        nodes = [MagicMock() for _ in range(4)]
        result = await rerank_nodes(nodes, "query", top_n=2)
        assert len(result) == 2
