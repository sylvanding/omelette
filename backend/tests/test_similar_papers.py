"""Tests for weighted similar paper matching (OPT-008)."""

from unittest.mock import MagicMock, patch

import numpy as np
import pytest
from httpx import ASGITransport, AsyncClient

from app.database import Base, async_session_factory, engine
from app.main import app
from app.models import Paper, Project


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


@pytest.fixture
async def project_with_papers():
    async with async_session_factory() as session:
        project = Project(name="Similar Papers Test", domain="physics")
        session.add(project)
        await session.flush()

        paper1 = Paper(
            project_id=project.id,
            title="Quantum Mechanics Review",
            abstract="A review of quantum mechanics.",
            year=2023,
        )
        paper2 = Paper(
            project_id=project.id,
            title="Classical Physics Overview",
            abstract="Newtonian mechanics and thermodynamics.",
            year=2022,
        )
        paper3 = Paper(
            project_id=project.id,
            title="Abstract Algebra Applications",
            abstract="Group theory in physics.",
            year=2024,
        )
        session.add_all([paper1, paper2, paper3])
        await session.flush()
        await session.commit()
        return project.id, paper1.id, paper2.id, paper3.id


def _make_mock_collection():
    """Create a mock ChromaDB collection for similar papers tests."""
    mock = MagicMock()
    mock.get = MagicMock(return_value={"embeddings": [], "metadatas": []})
    mock.query = MagicMock(return_value={"metadatas": [], "distances": []})
    return mock


def _embeddings_for_sections(sections: list[str], dim: int = 128) -> list[list[float]]:
    """Create deterministic embeddings that vary by section name for testing."""
    embeddings = []
    for _i, section in enumerate(sections):
        base = hash(section) % 1000 / 1000.0
        embeddings.append([base + j * 0.001 for j in range(dim)])
    return embeddings


class TestWeightedSimilarPaperMatching:
    """Tests for OPT-008: weighted chunk averaging for similar paper matching."""

    @pytest.mark.asyncio
    async def test_abstract_weighted_higher_in_paper_vector(self, client, project_with_papers):
        """Abstract chunks should contribute 3x more to the paper vector than default sections."""
        project_id, paper1_id, _, _ = project_with_papers
        mock_collection = _make_mock_collection()

        # Source paper has 1 abstract chunk and 1 methods chunk
        sections = ["abstract", "methods"]
        embeddings = _embeddings_for_sections(sections)
        metadatas = [
            {"paper_id": paper1_id, "section": "abstract", "chunk_index": 0},
            {"paper_id": paper1_id, "section": "methods", "chunk_index": 1},
        ]
        mock_collection.get.return_value = {
            "embeddings": embeddings,
            "metadatas": metadatas,
        }

        # Query results: one candidate paper
        mock_collection.query.return_value = {
            "metadatas": [[{"paper_id": 2, "section": "results", "chunk_index": 0}]],
            "distances": [[0.3]],
        }

        mock_rag_service = MagicMock()
        mock_rag_service._get_collection.return_value = mock_collection

        with patch("app.services.rag_service.RAGService", return_value=mock_rag_service):
            resp = await client.get(f"/api/v1/projects/{project_id}/papers/{paper1_id}/similar")

        assert resp.status_code == 200
        # Verify the paper vector was computed with weighting (abstract weighted 3x)
        mock_collection.query.assert_called_once()
        call_kwargs = mock_collection.query.call_args
        query_embedding = call_kwargs[1]["query_embeddings"][0]

        # Abstract embedding should be weighted 3x, methods 1x
        expected = np.average(embeddings, axis=0, weights=[3.0, 1.0])
        assert np.allclose(query_embedding, expected.tolist())

    @pytest.mark.asyncio
    async def test_median_used_for_distance_aggregation(self, client, project_with_papers):
        """Median should be used instead of mean for per-paper distance aggregation."""
        project_id, paper1_id, _, _ = project_with_papers
        mock_collection = _make_mock_collection()

        embeddings = _embeddings_for_sections(["abstract"])
        metadatas = [{"paper_id": paper1_id, "section": "abstract", "chunk_index": 0}]
        mock_collection.get.return_value = {
            "embeddings": embeddings,
            "metadatas": metadatas,
        }

        # Candidate paper has 3 chunks with different distances
        # median([0.1, 0.2, 0.9]) = 0.2, similarity = (1 - 0.2) * 100 = 80.0
        mock_collection.query.return_value = {
            "metadatas": [
                [
                    {"paper_id": 2, "section": "abstract", "chunk_index": 0},
                    {"paper_id": 2, "section": "introduction", "chunk_index": 1},
                    {"paper_id": 2, "section": "conclusion", "chunk_index": 2},
                ]
            ],
            "distances": [[0.1, 0.2, 0.9]],
        }

        mock_rag_service = MagicMock()
        mock_rag_service._get_collection.return_value = mock_collection

        with patch("app.services.rag_service.RAGService", return_value=mock_rag_service):
            resp = await client.get(f"/api/v1/projects/{project_id}/papers/{paper1_id}/similar")

        assert resp.status_code == 200
        body = resp.json()
        assert len(body["data"]) == 1
        assert body["data"][0]["similarity_score"] == 80.0

    @pytest.mark.asyncio
    async def test_references_excluded_from_candidate_scoring(self, client, project_with_papers):
        """Chunks from references section should not contribute to candidate paper scores."""
        project_id, paper1_id, _, _ = project_with_papers
        mock_collection = _make_mock_collection()

        embeddings = _embeddings_for_sections(["abstract"])
        metadatas = [{"paper_id": paper1_id, "section": "abstract", "chunk_index": 0}]
        mock_collection.get.return_value = {
            "embeddings": embeddings,
            "metadatas": metadatas,
        }

        # Candidate paper has only references chunks — should not appear in results
        mock_collection.query.return_value = {
            "metadatas": [
                [
                    {"paper_id": 2, "section": "references", "chunk_index": 0},
                    {"paper_id": 2, "section": "references", "chunk_index": 1},
                ]
            ],
            "distances": [[0.1, 0.2]],
        }

        mock_rag_service = MagicMock()
        mock_rag_service._get_collection.return_value = mock_collection

        with patch("app.services.rag_service.RAGService", return_value=mock_rag_service):
            resp = await client.get(f"/api/v1/projects/{project_id}/papers/{paper1_id}/similar")

        assert resp.status_code == 200
        body = resp.json()
        assert body["data"] == []

    @pytest.mark.asyncio
    async def test_fallback_uniform_when_all_weights_zero(self, client, project_with_papers):
        """If all source chunks are from zero-weight sections, fall back to uniform averaging."""
        project_id, paper1_id, _, _ = project_with_papers
        mock_collection = _make_mock_collection()

        embeddings = _embeddings_for_sections(["references", "references"])
        metadatas = [
            {"paper_id": paper1_id, "section": "references", "chunk_index": 0},
            {"paper_id": paper1_id, "section": "references", "chunk_index": 1},
        ]
        mock_collection.get.return_value = {
            "embeddings": embeddings,
            "metadatas": metadatas,
        }

        mock_collection.query.return_value = {
            "metadatas": [[{"paper_id": 2, "section": "abstract", "chunk_index": 0}]],
            "distances": [[0.3]],
        }

        mock_rag_service = MagicMock()
        mock_rag_service._get_collection.return_value = mock_collection

        with patch("app.services.rag_service.RAGService", return_value=mock_rag_service):
            resp = await client.get(f"/api/v1/projects/{project_id}/papers/{paper1_id}/similar")

        assert resp.status_code == 200
        # Should use np.mean as fallback
        mock_collection.query.assert_called_once()
        call_kwargs = mock_collection.query.call_args
        query_embedding = call_kwargs[1]["query_embeddings"][0]
        expected = np.mean(embeddings, axis=0)
        assert np.allclose(query_embedding, expected.tolist())

    @pytest.mark.asyncio
    async def test_section_weight_variations_handled(self, client, project_with_papers):
        """Section names like 'methodology', 'intro' should map to correct weights."""
        project_id, paper1_id, _, _ = project_with_papers
        mock_collection = _make_mock_collection()

        sections = ["intro", "methodology", "discussion", "results", "conclusion"]
        embeddings = _embeddings_for_sections(sections)
        metadatas = [{"paper_id": paper1_id, "section": s, "chunk_index": i} for i, s in enumerate(sections)]
        mock_collection.get.return_value = {
            "embeddings": embeddings,
            "metadatas": metadatas,
        }

        mock_collection.query.return_value = {
            "metadatas": [[{"paper_id": 2, "section": "abstract", "chunk_index": 0}]],
            "distances": [[0.25]],
        }

        expected_weights = [2.0, 1.0, 2.0, 1.5, 2.5]

        mock_rag_service = MagicMock()
        mock_rag_service._get_collection.return_value = mock_collection

        with patch("app.services.rag_service.RAGService", return_value=mock_rag_service):
            resp = await client.get(f"/api/v1/projects/{project_id}/papers/{paper1_id}/similar")

        assert resp.status_code == 200
        call_kwargs = mock_collection.query.call_args
        query_embedding = call_kwargs[1]["query_embeddings"][0]
        expected_vector = np.average(embeddings, axis=0, weights=expected_weights)
        assert np.allclose(query_embedding, expected_vector.tolist())

    @pytest.mark.asyncio
    async def test_api_response_format_unchanged(self, client, project_with_papers):
        """API response format should remain the same after weighted changes."""
        project_id, paper1_id, _, _ = project_with_papers
        mock_collection = _make_mock_collection()

        embeddings = _embeddings_for_sections(["abstract"])
        metadatas = [{"paper_id": paper1_id, "section": "abstract", "chunk_index": 0}]
        mock_collection.get.return_value = {
            "embeddings": embeddings,
            "metadatas": metadatas,
        }

        mock_collection.query.return_value = {
            "metadatas": [
                [
                    {"paper_id": 2, "section": "abstract", "chunk_index": 0},
                ]
            ],
            "distances": [[0.3]],
        }

        mock_rag_service = MagicMock()
        mock_rag_service._get_collection.return_value = mock_collection

        with patch("app.services.rag_service.RAGService", return_value=mock_rag_service):
            resp = await client.get(f"/api/v1/projects/{project_id}/papers/{paper1_id}/similar")

        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 200
        paper = body["data"][0]
        assert "id" in paper
        assert "title" in paper
        assert "authors" in paper
        assert "year" in paper
        assert "journal" in paper
        assert "citation_count" in paper
        assert "similarity_score" in paper
