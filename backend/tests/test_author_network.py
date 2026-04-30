"""Tests for AuthorNetworkService and author network API endpoint."""

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
        project = Project(name="Network Test Project", domain="AI")
        session.add(project)
        await session.flush()

        # Papers with overlapping authors to form a network
        papers = [
            Paper(
                project_id=project.id,
                title="Paper A",
                doi="10.1234/a",
                source_id="s2:a",
                authors=[{"name": "Alice Smith"}, {"name": "Bob Jones"}],
                year=2023,
            ),
            Paper(
                project_id=project.id,
                title="Paper B",
                doi="10.1234/b",
                source_id="s2:b",
                authors=[{"name": "Alice Smith"}, {"name": "Carol Lee"}],
                year=2023,
            ),
            Paper(
                project_id=project.id,
                title="Paper C",
                doi="10.1234/c",
                source_id="s2:c",
                authors=[{"name": "Bob Jones"}, {"name": "Carol Lee"}],
                year=2024,
            ),
        ]
        for p in papers:
            session.add(p)
        await session.commit()
        return {"project_id": project.id}


class TestAuthorNetworkService:
    """Unit tests for AuthorNetworkService."""

    async def test_network_returns_nodes_and_edges(self, project_with_papers):
        from app.services.author_network_service import AuthorNetworkService

        info = project_with_papers

        async with async_session_factory() as session:
            svc = AuthorNetworkService(session)
            result = await svc.build_network(info["project_id"])

        assert "nodes" in result
        assert "edges" in result
        assert "metrics" in result
        assert result["total_authors"] == 3
        assert len(result["nodes"]) == 3
        assert len(result["edges"]) == 3  # Alice-Bob, Alice-Carol, Bob-Carol

    async def test_empty_project_returns_empty_network(self):
        from app.services.author_network_service import AuthorNetworkService

        async with async_session_factory() as session:
            project = Project(name="Empty Project", domain="AI")
            session.add(project)
            await session.commit()
            project_id = project.id

        async with async_session_factory() as session:
            svc = AuthorNetworkService(session)
            result = await svc.build_network(project_id)

        assert result["nodes"] == []
        assert result["edges"] == []
        assert result["total_authors"] == 0

    async def test_paper_without_authors_skipped(self):
        from app.services.author_network_service import AuthorNetworkService

        async with async_session_factory() as session:
            project = Project(name="No Author Project", domain="AI")
            session.add(project)
            await session.flush()
            paper = Paper(
                project_id=project.id,
                title="Orphan Paper",
                doi="10.1234/orphan",
                source_id="s2:orphan",
                authors=None,
                year=2024,
            )
            session.add(paper)
            await session.commit()
            project_id = project.id

        async with async_session_factory() as session:
            svc = AuthorNetworkService(session)
            result = await svc.build_network(project_id)

        assert result["nodes"] == []
        assert result["edges"] == []

    async def test_min_collaborations_filters_edges(self, project_with_papers):
        from app.services.author_network_service import AuthorNetworkService

        info = project_with_papers

        async with async_session_factory() as session:
            svc = AuthorNetworkService(session)
            result = await svc.build_network(info["project_id"], min_collaborations=2)

        # All pairs only co-author once, so no edges should pass the threshold
        assert len(result["edges"]) == 0

    async def test_max_nodes_limits_results(self):
        from app.services.author_network_service import AuthorNetworkService

        async with async_session_factory() as session:
            project = Project(name="Big Project", domain="AI")
            session.add(project)
            await session.flush()

            # Create papers with many different authors
            for i in range(20):
                paper = Paper(
                    project_id=project.id,
                    title=f"Paper {i}",
                    doi=f"10.1234/big{i}",
                    source_id=f"s2:big{i}",
                    authors=[{"name": f"Author {i}"}, {"name": "Central Author"}],
                    year=2024,
                )
                session.add(paper)
            await session.commit()
            project_id = project.id

        async with async_session_factory() as session:
            svc = AuthorNetworkService(session)
            result = await svc.build_network(project_id, max_nodes=5)

        assert len(result["nodes"]) <= 5

    async def test_string_authors_handled(self):
        from app.services.author_network_service import AuthorNetworkService

        async with async_session_factory() as session:
            project = Project(name="String Author Project", domain="AI")
            session.add(project)
            await session.flush()
            paper = Paper(
                project_id=project.id,
                title="String Authors",
                doi="10.1234/str",
                source_id="s2:str",
                authors=["Alice Smith", "Bob Jones"],
                year=2024,
            )
            session.add(paper)
            await session.commit()
            project_id = project.id

        async with async_session_factory() as session:
            svc = AuthorNetworkService(session)
            result = await svc.build_network(project_id)

        assert result["total_authors"] == 2
        assert len(result["nodes"]) == 2


class TestAuthorNetworkAPI:
    """API endpoint tests for author network."""

    @pytest.mark.asyncio
    async def test_author_network_endpoint(self, client: AsyncClient, project_with_papers):
        info = project_with_papers

        resp = await client.get(f"/api/v1/projects/{info['project_id']}/analysis/author-network")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert "nodes" in data
        assert "edges" in data
        assert "metrics" in data
        assert data["total_authors"] == 3

    @pytest.mark.asyncio
    async def test_author_network_with_params(self, client: AsyncClient, project_with_papers):
        info = project_with_papers

        resp = await client.get(
            f"/api/v1/projects/{info['project_id']}/analysis/author-network",
            params={"min_collaborations": 2, "max_nodes": 50},
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert "nodes" in data

    @pytest.mark.asyncio
    async def test_author_network_project_not_found(self, client: AsyncClient):
        resp = await client.get("/api/v1/projects/99999/analysis/author-network")
        assert resp.status_code in (404, 500)
