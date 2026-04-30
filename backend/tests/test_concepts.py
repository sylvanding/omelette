"""Tests for concept knowledge graph endpoints and service."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import Base, engine
from app.main import app

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
async def setup_db():
    """Create tables before each test, drop after."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def client():
    """Async HTTP client for in-process testing."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def project_id(client: AsyncClient) -> int:
    """Create a project and return its ID."""
    resp = await client.post("/api/v1/projects", json={"name": "Test Project", "domain": "optics"})
    assert resp.status_code == 201
    return resp.json()["data"]["id"]


def _make_mock_paper(paper_id: int, title: str, abstract: str):
    """Create a mock paper object with needed attributes."""
    paper = MagicMock()
    paper.id = paper_id
    paper.title = title
    paper.abstract = abstract
    return paper


# ---------------------------------------------------------------------------
# Concept Service Unit Tests
# ---------------------------------------------------------------------------


class TestConceptServiceUnit:
    """Unit tests for ConceptService logic."""

    @pytest.mark.asyncio
    async def test_empty_papers_returns_empty(self):
        """Verify that zero papers returns empty concepts."""
        from app.services.concept_service import ConceptService

        svc = ConceptService(AsyncMock())
        result = await svc.extract_concepts([])
        assert result == []

    @pytest.mark.asyncio
    async def test_extract_concepts_returns_structured_data(self):
        """Verify concept extraction returns structured data."""
        from app.services.concept_service import ConceptService

        mock_llm = AsyncMock()
        mock_llm.chat_json.return_value = {
            "concepts": [
                {
                    "name": "Machine Learning",
                    "definition": "Algorithms that learn from data.",
                    "frequency": 2,
                    "related_papers": [1, 2],
                },
            ]
        }
        svc = ConceptService(mock_llm)
        result = await svc.extract_concepts(
            [
                {"paper_id": 1, "title": "Paper A", "abstract": "ML in science"},
                {"paper_id": 2, "title": "Paper B", "abstract": "Deep learning"},
            ]
        )
        assert len(result) == 1
        assert result[0]["name"] == "Machine Learning"
        assert result[0]["frequency"] == 2
        assert result[0]["related_papers"] == [1, 2]

    @pytest.mark.asyncio
    async def test_build_graph_with_single_concept(self):
        """Verify graph building with a single concept returns no edges."""
        from app.services.concept_service import ConceptService

        svc = ConceptService(AsyncMock())
        result = await svc.build_concept_graph(
            [{"name": "Single", "definition": "One concept", "frequency": 1, "related_papers": [1]}]
        )
        assert len(result["nodes"]) == 1
        assert result["edges"] == []
        assert result["total_concepts"] == 1

    @pytest.mark.asyncio
    async def test_build_graph_returns_relationships(self):
        """Verify graph building identifies concept relationships."""
        from app.services.concept_service import ConceptService

        mock_llm = AsyncMock()
        mock_llm.chat_json.return_value = {
            "related_concepts": [
                {
                    "concept_a": "Deep Learning",
                    "concept_b": "Neural Networks",
                    "relation_type": "related_to",
                    "description": "DL uses neural networks.",
                },
            ]
        }
        svc = ConceptService(mock_llm)
        concepts = [
            {"name": "Deep Learning", "definition": "...", "frequency": 2, "related_papers": [1]},
            {"name": "Neural Networks", "definition": "...", "frequency": 2, "related_papers": [1]},
        ]
        result = await svc.build_concept_graph(concepts)
        assert len(result["edges"]) == 1
        assert result["edges"][0]["source"] == "Deep Learning"
        assert result["edges"][0]["target"] == "Neural Networks"
        assert result["edges"][0]["relation_type"] == "related_to"

    @pytest.mark.asyncio
    async def test_topic_page_without_papers(self):
        """Verify topic page generation works with no papers."""
        from app.services.concept_service import ConceptService

        svc = ConceptService(AsyncMock())
        result = await svc.get_topic_page(
            concept_name="Test Concept",
            concept_def="A test concept",
            related_concepts=["Related A"],
            papers=[],
        )
        assert result["concept_name"] == "Test Concept"
        assert result["overview"] != ""
        assert result["key_findings"] == []

    @pytest.mark.asyncio
    async def test_topic_page_returns_overview(self):
        """Verify topic page generation returns overview with findings."""
        from app.services.concept_service import ConceptService

        mock_llm = AsyncMock()
        mock_llm.chat_json.return_value = {
            "overview": "This is a comprehensive overview.",
            "key_findings": ["Finding 1", "Finding 2"],
            "related_topics": ["Topic A"],
            "research_directions": ["Direction 1"],
        }
        svc = ConceptService(mock_llm)
        result = await svc.get_topic_page(
            concept_name="Test Concept",
            concept_def="Definition",
            related_concepts=["Related A"],
            papers=[{"paper_id": 1, "title": "Test Paper", "abstract": "Abstract about test concept"}],
        )
        assert result["overview"] == "This is a comprehensive overview."
        assert len(result["key_findings"]) == 2


# ---------------------------------------------------------------------------
# API Endpoint Tests
# ---------------------------------------------------------------------------


class TestConceptsAPI:
    """Tests for /api/v1/projects/{project_id}/concepts endpoints."""

    @pytest.mark.asyncio
    async def test_extract_empty_project_returns_zeroes(self, client: AsyncClient, project_id: int):
        """Verify that a project with no papers returns empty concepts."""
        resp = await client.post(
            f"/api/v1/projects/{project_id}/concepts/extract",
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 200
        data = body["data"]
        assert data["nodes"] == []
        assert data["total_concepts"] == 0

    @pytest.mark.asyncio
    async def test_extract_returns_structured_data(self, client: AsyncClient, project_id: int):
        """Verify the extract endpoint returns structured concept data."""
        from app.api.deps import get_db

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [
            _make_mock_paper(1, "Paper A", "Abstract about deep learning"),
            _make_mock_paper(2, "Paper B", "Abstract about super-resolution"),
        ]

        async def mock_get_db():
            mock_session = AsyncMock()
            mock_session.execute.return_value = mock_result
            yield mock_session

        app.dependency_overrides[get_db] = mock_get_db
        try:
            with (
                patch(
                    "app.services.concept_service.ConceptService.extract_concepts",
                    new_callable=AsyncMock,
                    return_value=[
                        {
                            "name": "Deep Learning",
                            "definition": "ML with neural networks",
                            "frequency": 2,
                            "related_papers": [1, 2],
                        },
                    ],
                ),
                patch(
                    "app.services.concept_service.ConceptService.build_concept_graph",
                    new_callable=AsyncMock,
                    return_value={
                        "nodes": [
                            {
                                "name": "Deep Learning",
                                "definition": "ML with neural networks",
                                "frequency": 2,
                                "related_papers": [1, 2],
                                "related_concepts": [],
                            },
                        ],
                        "edges": [],
                        "total_concepts": 1,
                    },
                ),
            ):
                resp = await client.post(
                    f"/api/v1/projects/{project_id}/concepts/extract",
                )
        finally:
            app.dependency_overrides.pop(get_db, None)

        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data["nodes"]) == 1
        node = data["nodes"][0]
        assert node["name"] == "Deep Learning"
        assert node["frequency"] == 2
        assert isinstance(node["related_papers"], list)

    @pytest.mark.asyncio
    async def test_graph_endpoint_returns_concept_network(self, client: AsyncClient, project_id: int):
        """Verify the graph endpoint returns concept network with relationships."""
        from app.api.deps import get_db

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [
            _make_mock_paper(1, "Paper A", "Abstract A"),
            _make_mock_paper(2, "Paper B", "Abstract B"),
        ]

        async def mock_get_db():
            mock_session = AsyncMock()
            mock_session.execute.return_value = mock_result
            yield mock_session

        app.dependency_overrides[get_db] = mock_get_db
        try:
            with (
                patch(
                    "app.services.concept_service.ConceptService.extract_concepts",
                    new_callable=AsyncMock,
                    return_value=[
                        {"name": "Concept A", "definition": "Def A", "frequency": 1, "related_papers": [1]},
                        {"name": "Concept B", "definition": "Def B", "frequency": 1, "related_papers": [2]},
                    ],
                ),
                patch(
                    "app.services.concept_service.ConceptService.build_concept_graph",
                    new_callable=AsyncMock,
                    return_value={
                        "nodes": [
                            {
                                "name": "Concept A",
                                "definition": "Def A",
                                "frequency": 1,
                                "related_papers": [1],
                                "related_concepts": ["Concept B"],
                            },
                            {
                                "name": "Concept B",
                                "definition": "Def B",
                                "frequency": 1,
                                "related_papers": [2],
                                "related_concepts": ["Concept A"],
                            },
                        ],
                        "edges": [
                            {
                                "source": "Concept A",
                                "target": "Concept B",
                                "relation_type": "related_to",
                                "description": "Related",
                            },
                        ],
                        "total_concepts": 2,
                    },
                ),
            ):
                resp = await client.get(
                    f"/api/v1/projects/{project_id}/concepts/graph",
                )
        finally:
            app.dependency_overrides.pop(get_db, None)

        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["total_concepts"] == 2
        assert len(data["edges"]) == 1
        assert data["edges"][0]["relation_type"] == "related_to"

    @pytest.mark.asyncio
    async def test_topic_page_returns_overview(self, client: AsyncClient, project_id: int):
        """Verify the topic page endpoint returns a concept overview."""
        from app.api.deps import get_db

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [
            _make_mock_paper(1, "Paper A", "Abstract about deep learning"),
        ]

        async def mock_get_db():
            mock_session = AsyncMock()
            mock_session.execute.return_value = mock_result
            yield mock_session

        app.dependency_overrides[get_db] = mock_get_db
        try:
            with (
                patch(
                    "app.services.concept_service.ConceptService.extract_concepts",
                    new_callable=AsyncMock,
                    return_value=[
                        {
                            "name": "Deep Learning",
                            "definition": "ML with neural networks",
                            "frequency": 1,
                            "related_papers": [1],
                        },
                    ],
                ),
                patch(
                    "app.services.concept_service.ConceptService.build_concept_graph",
                    new_callable=AsyncMock,
                    return_value={
                        "nodes": [
                            {
                                "name": "Deep Learning",
                                "definition": "ML with neural networks",
                                "frequency": 1,
                                "related_papers": [1],
                                "related_concepts": [],
                            },
                        ],
                        "edges": [],
                        "total_concepts": 1,
                    },
                ),
                patch(
                    "app.services.concept_service.ConceptService.get_topic_page",
                    new_callable=AsyncMock,
                    return_value={
                        "concept_name": "Deep Learning",
                        "definition": "ML with neural networks",
                        "overview": "Deep learning is a subset of machine learning...",
                        "key_findings": ["Finding 1"],
                        "related_topics": ["Neural Networks"],
                        "research_directions": ["Direction 1"],
                    },
                ),
            ):
                resp = await client.get(
                    f"/api/v1/projects/{project_id}/concepts/Deep%20Learning/page",
                )
        finally:
            app.dependency_overrides.pop(get_db, None)

        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["concept_name"] == "Deep Learning"
        assert data["overview"] != ""
        assert len(data["key_findings"]) >= 0
