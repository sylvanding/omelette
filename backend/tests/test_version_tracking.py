"""Tests for PaperVersion model, VersionService, and version tracking API endpoints."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import Base, async_session_factory, engine
from app.main import app
from app.models import Paper, PaperVersion, Project


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
async def project_with_paper():
    async with async_session_factory() as session:
        project = Project(name="Version Test Project", domain="AI")
        session.add(project)
        await session.flush()

        paper = Paper(
            project_id=project.id,
            title="Preprint Paper",
            doi="10.1234/preprint",
            source_id="s2:pp1",
            abstract="Original abstract.",
            year=2024,
            citation_count=5,
        )
        session.add(paper)
        await session.commit()
        return {"project_id": project.id, "paper_id": paper.id}


class TestVersionService:
    """Unit tests for VersionService."""

    async def test_get_version_history_empty(self, project_with_paper):
        from app.services.version_service import VersionService

        async with async_session_factory() as session:
            svc = VersionService(session)
            versions = await svc.get_version_history(project_with_paper["paper_id"])
            assert versions == []

    async def test_record_version(self, project_with_paper):
        from app.services.version_service import VersionService

        async with async_session_factory() as session:
            svc = VersionService(session)
            version_info = {
                "source": "manual",
                "doi": "10.1234/journal",
                "title": "Updated Paper Title",
                "abstract": "Updated abstract.",
                "journal": "Test Journal",
                "year": 2024,
                "citation_count": 10,
                "is_preprint": False,
            }
            entry = await svc.record_version(project_with_paper["paper_id"], version_info)

            assert entry["version"] == 1
            assert entry["title"] == "Updated Paper Title"
            assert entry["journal"] == "Test Journal"
            assert entry["is_preprint"] is False

    async def test_record_multiple_versions_increments(self, project_with_paper):
        from app.services.version_service import VersionService

        async with async_session_factory() as session:
            svc = VersionService(session)
            v1 = await svc.record_version(
                project_with_paper["paper_id"],
                {"source": "manual", "title": "v1", "doi": "10.1/a", "is_preprint": True},
            )
            v2 = await svc.record_version(
                project_with_paper["paper_id"],
                {"source": "manual", "title": "v2", "doi": "10.1/b", "is_preprint": False},
            )

            assert v1["version"] == 1
            assert v2["version"] == 2

    async def test_upgrade_to_version(self, project_with_paper):
        from app.services.version_service import VersionService

        async with async_session_factory() as session:
            paper = await session.get(Paper, project_with_paper["paper_id"])
            paper.tags = ["important", "read-later"]
            paper.notes = "My personal notes"
            await session.flush()

            svc = VersionService(session)
            version_info = {
                "source": "manual",
                "doi": "10.1234/journal",
                "title": "Journal Version",
                "abstract": "Journal abstract.",
                "journal": "Nature",
                "year": 2024,
                "citation_count": 50,
                "is_preprint": False,
            }
            v = await svc.record_version(project_with_paper["paper_id"], version_info)

            result = await svc.upgrade_to_version(project_with_paper["paper_id"], v["id"])

            assert result["paper_id"] == project_with_paper["paper_id"]
            assert result["upgraded_to_version"] == 1
            assert result["new_journal"] == "Nature"

    async def test_upgrade_preserves_user_data(self, project_with_paper):
        from app.services.version_service import VersionService

        async with async_session_factory() as session:
            paper = await session.get(Paper, project_with_paper["paper_id"])
            paper.tags = ["tag1"]
            paper.notes = "test notes"
            paper.rating = 4
            await session.flush()

            svc = VersionService(session)
            v = await svc.record_version(
                project_with_paper["paper_id"],
                {"source": "manual", "title": "New Title", "doi": "10.1/x", "journal": "New Journal"},
            )
            await svc.upgrade_to_version(project_with_paper["paper_id"], v["id"])

            refreshed = await session.get(Paper, project_with_paper["paper_id"])
            assert refreshed.notes == "test notes"
            assert refreshed.tags == ["tag1"]
            assert refreshed.rating == 4

    async def test_compute_diff(self, project_with_paper):
        from app.services.version_service import VersionService

        async with async_session_factory() as session:
            svc = VersionService(session)
            paper = await session.get(Paper, project_with_paper["paper_id"])

            new_version = {
                "title": "Completely Different Title",
                "journal": "New Journal",
                "citation_count": 100,
            }
            diff = await svc._compute_diff(paper, new_version)

            assert diff is not None
            assert "Title changed" in diff
            assert "New Journal" in diff
            assert "100" in diff

    async def test_upgrade_version_not_found(self, project_with_paper):
        from app.services.version_service import VersionService

        async with async_session_factory() as session:
            svc = VersionService(session)
            with pytest.raises(ValueError, match="not found"):
                await svc.upgrade_to_version(project_with_paper["paper_id"], 99999)

    async def test_upgrade_version_wrong_paper(self, project_with_paper):
        from app.services.version_service import VersionService

        async with async_session_factory() as session:
            # Create a second paper in a different project
            from app.models import Paper, Project

            other_project = Project(name="Other", domain="test")
            session.add(other_project)
            await session.flush()

            other_paper = Paper(
                project_id=other_project.id,
                title="Other Paper",
                doi="10.other/other",
            )
            session.add(other_paper)
            await session.flush()

            v = PaperVersion(
                paper_id=other_paper.id,
                version=1,
                source="test",
                title="Other Paper Version",
            )
            session.add(v)
            await session.flush()

            svc = VersionService(session)
            with pytest.raises(ValueError, match="does not belong"):
                await svc.upgrade_to_version(project_with_paper["paper_id"], v.id)


class TestVersionTrackingAPI:
    """API endpoint tests for version tracking."""

    @pytest.mark.asyncio
    async def test_get_versions_empty(self, client: AsyncClient, project_with_paper):
        info = project_with_paper
        resp = await client.get(f"/api/v1/projects/{info['project_id']}/papers/{info['paper_id']}/versions")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["versions"] == []
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_get_versions_with_data(self, client: AsyncClient, project_with_paper):
        info = project_with_paper
        # Seed a version entry
        async with async_session_factory() as session:
            v = PaperVersion(
                paper_id=info["paper_id"],
                version=1,
                source="test",
                doi="10.1234/test",
                title="Test Version",
                journal="Test Journal",
                year=2024,
                citation_count=10,
                is_preprint=False,
            )
            session.add(v)
            await session.commit()

        resp = await client.get(f"/api/v1/projects/{info['project_id']}/papers/{info['paper_id']}/versions")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data["versions"]) == 1
        assert data["versions"][0]["title"] == "Test Version"

    @pytest.mark.asyncio
    async def test_check_updates_no_doi(self, client: AsyncClient, project_with_paper):
        info = project_with_paper
        # Remove DOI from paper
        async with async_session_factory() as session:
            paper = await session.get(Paper, info["paper_id"])
            paper.doi = None
            await session.commit()

        resp = await client.post(f"/api/v1/projects/{info['project_id']}/papers/{info['paper_id']}/versions/check")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["update_found"] is False

    @pytest.mark.asyncio
    async def test_upgrade_version_endpoint(self, client: AsyncClient, project_with_paper):
        info = project_with_paper
        # Seed a version entry
        async with async_session_factory() as session:
            v = PaperVersion(
                paper_id=info["paper_id"],
                version=1,
                source="test",
                doi="10.1234/upgraded",
                title="Upgraded Version",
                journal="Upgraded Journal",
                year=2024,
                citation_count=50,
                is_preprint=False,
            )
            session.add(v)
            await session.commit()
            version_id = v.id

        resp = await client.post(
            f"/api/v1/projects/{info['project_id']}/papers/{info['paper_id']}/versions/{version_id}/upgrade"
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["new_journal"] == "Upgraded Journal"


class TestVersionHelpers:
    """Tests for helper functions in version_service."""

    def test_is_preprint_arxiv(self):
        from app.services.version_service import _is_preprint_source

        metadata = {"externalIds": {"ArXiv": "2401.12345"}, "venue": "arXiv preprint"}
        assert _is_preprint_source(metadata) is True

    def test_is_preprint_journal(self):
        from app.services.version_service import _is_preprint_source

        metadata = {
            "externalIds": {"DOI": "10.1234/nature.2024"},
            "venue": "Nature",
        }
        assert _is_preprint_source(metadata) is False

    def test_extract_preprint_server_arxiv(self):
        from app.services.version_service import _extract_preprint_server

        metadata = {"externalIds": {"ArXiv": "2401.12345"}}
        assert _extract_preprint_server(metadata) == "arXiv"

    def test_extract_preprint_server_biorxiv(self):
        from app.services.version_service import _extract_preprint_server

        metadata = {"externalIds": {"BioRxiv": "2024.01.01.123456"}}
        assert _extract_preprint_server(metadata) == "bioRxiv"

    def test_extract_preprint_server_none(self):
        from app.services.version_service import _extract_preprint_server

        metadata = {"externalIds": {"DOI": "10.1234/nature.2024"}}
        assert _extract_preprint_server(metadata) is None
