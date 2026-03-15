"""Tests for embedding service — mock HuggingFace, verify vector dims and types."""

from unittest.mock import patch

import pytest

from app.services import embedding_service


@pytest.fixture(autouse=True)
def reset_embedding_cache():
    """Clear cached embedding model between tests."""
    embedding_service._cached_embed_model = None
    yield
    embedding_service._cached_embed_model = None


class TestGetEmbeddingModel:
    """Tests for get_embedding_model."""

    def test_mock_provider_returns_mock_embedding(self):
        model = embedding_service.get_embedding_model(provider="mock", force_reload=True)
        assert model is not None
        assert model.embed_dim == 1024

    def test_mock_provider_embedding_vector_dimension_and_type(self):
        model = embedding_service.get_embedding_model(provider="mock", force_reload=True)
        vector = model.get_text_embedding("test text")
        assert isinstance(vector, list)
        assert len(vector) == 1024
        assert all(isinstance(x, float) for x in vector)

    def test_mock_provider_caching(self):
        model1 = embedding_service.get_embedding_model(provider="mock", force_reload=True)
        model2 = embedding_service.get_embedding_model(provider="mock")
        assert model1 is model2

    def test_mock_provider_force_reload_clears_cache(self):
        model1 = embedding_service.get_embedding_model(provider="mock", force_reload=True)
        model2 = embedding_service.get_embedding_model(provider="mock", force_reload=True)
        assert model1 is not model2

    @patch("app.services.embedding_service._build_local_embedding")
    def test_local_provider_uses_mocked_huggingface(self, mock_build):
        from llama_index.core.embeddings import MockEmbedding

        mock_build.return_value = MockEmbedding(embed_dim=768)
        model = embedding_service.get_embedding_model(provider="local", force_reload=True)
        mock_build.assert_called_once()
        assert model.embed_dim == 768

    @patch("app.services.embedding_service._build_api_embedding")
    def test_api_provider_uses_openai_embedding(self, mock_build):
        from llama_index.core.embeddings import MockEmbedding

        mock_build.return_value = MockEmbedding(embed_dim=1536)
        model = embedding_service.get_embedding_model(provider="api", force_reload=True)
        mock_build.assert_called_once()
        assert model.embed_dim == 1536


class TestDetectGpu:
    """Tests for detect_gpu."""

    def test_detect_gpu_returns_tuple(self):
        has_gpu, count, device = embedding_service.detect_gpu()
        assert isinstance(has_gpu, bool)
        assert isinstance(count, int)
        assert isinstance(device, str)
        assert device in ("cuda", "cpu")

    def test_detect_gpu_no_raise(self):
        """detect_gpu never raises (handles missing torch)."""
        has_gpu, count, device = embedding_service.detect_gpu()
        assert device in ("cuda", "cpu")
