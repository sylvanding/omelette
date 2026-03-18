"""Omelette MCP Server — Expose literature tools and resources to AI IDEs."""

import json
import logging
from contextlib import asynccontextmanager

from mcp.server.fastmcp import FastMCP

from app.database import async_session_factory
from app.models import Paper, Project
from app.models.chunk import PaperChunk

logger = logging.getLogger(__name__)

mcp = FastMCP(
    name="Omelette Literature Server",
)


# Helper to get async db session
@asynccontextmanager
async def get_session():
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ==================== TOOLS ====================


@mcp.tool()
async def list_knowledge_bases() -> str:
    """List all available knowledge bases with paper counts.

    Returns a markdown table of all knowledge bases (projects) in the system.
    """
    from sqlalchemy import func, select

    async with get_session() as db:
        stmt = (
            select(
                Project.id,
                Project.name,
                Project.description,
                func.count(Paper.id).label("paper_count"),
            )
            .outerjoin(Paper, Paper.project_id == Project.id)
            .group_by(Project.id)
            .order_by(Project.updated_at.desc())
        )
        result = await db.execute(stmt)
        rows = result.all()

    if not rows:
        return "No knowledge bases found. Create one first."

    lines = ["## Knowledge Bases\n", "| ID | Name | Papers | Description |", "|---|---|---|---|"]
    for r in rows:
        desc = (r.description or "")[:60]
        lines.append(f"| {r.id} | {r.name} | {r.paper_count} | {desc} |")
    return "\n".join(lines)


@mcp.tool()
async def search_knowledge_base(query: str, kb_id: int, top_k: int = 5) -> str:
    """Search a knowledge base using RAG (vector retrieval + answer generation).

    Args:
        query: The search question or keywords
        kb_id: Knowledge base ID (use list_knowledge_bases to find IDs)
        top_k: Number of result chunks to return (default 5, max 50)
    """
    if top_k < 1 or top_k > 50:
        return "Error: top_k must be between 1 and 50."

    from app.services.rag_service import RAGService

    rag = RAGService()
    result = await rag.query(project_id=kb_id, question=query, top_k=top_k, include_sources=True)

    lines = [
        "## Search Results\n",
        f"**Query**: {query}\n",
        f"**Answer**: {result.get('answer', 'No answer generated.')}\n",
    ]

    sources = result.get("sources", [])
    if sources:
        lines.append("**Sources**:")
        for i, s in enumerate(sources, 1):
            title = s.get("paper_title", "Unknown")
            page = s.get("page_number", "?")
            score = s.get("relevance_score", 0)
            excerpt = s.get("excerpt", "")[:200]
            lines.append(f"{i}. **{title}** (p.{page}) — relevance: {score:.2f}")
            if excerpt:
                lines.append(f"   > {excerpt}")

    return "\n".join(lines)


@mcp.tool()
async def lookup_paper(doi: str = "", title: str = "", kb_id: int = 0) -> str:
    """Look up a paper by DOI or title. Searches local database first.

    Args:
        doi: Paper DOI (provide doi or title, at least one)
        title: Paper title for fuzzy search
        kb_id: Optional knowledge base ID to limit search scope
    """
    from sqlalchemy import select

    if not doi and not title:
        return "Error: Please provide either a DOI or title."

    async with get_session() as db:
        if doi:
            stmt = select(Paper).where(Paper.doi == doi)
            if kb_id:
                stmt = stmt.where(Paper.project_id == kb_id)
            result = await db.execute(stmt)
            paper = result.scalar_one_or_none()
        else:
            stmt = select(Paper).where(Paper.title.ilike(f"%{title}%"))
            if kb_id:
                stmt = stmt.where(Paper.project_id == kb_id)
            stmt = stmt.limit(5)
            result = await db.execute(stmt)
            papers = result.scalars().all()
            if not papers:
                return f"No papers found matching title '{title}'."
            if len(papers) == 1:
                paper = papers[0]
            else:
                lines = [f"## Multiple Matches ({len(papers)})\n"]
                for p in papers:
                    lines.append(f"- **{p.title}** (ID: {p.id}, DOI: {p.doi or 'N/A'}, Year: {p.year or '?'})")
                return "\n".join(lines)

        if not paper:
            return f"No paper found with DOI '{doi}'."

        authors_str = ""
        if paper.authors:
            authors_str = ", ".join(a.get("name", str(a)) if isinstance(a, dict) else str(a) for a in paper.authors)

        return f"""## Paper Info

- **Title**: {paper.title}
- **Authors**: {authors_str or "N/A"}
- **Journal**: {paper.journal or "N/A"}
- **Year**: {paper.year or "N/A"}
- **DOI**: {paper.doi or "N/A"}
- **Status**: {paper.status}
- **Abstract**: {(paper.abstract or "N/A")[:500]}"""


@mcp.tool()
async def find_citations(text: str, kb_id: int) -> str:
    """Find potential citation sources in a knowledge base for a given text passage.

    Args:
        text: The text passage that needs citations
        kb_id: Knowledge base ID to search in
    """
    from app.services.rag_service import RAGService

    rag = RAGService()
    result = await rag.query(project_id=kb_id, question=text, top_k=10, include_sources=True)

    sources = result.get("sources", [])
    if not sources:
        return "No potential citation sources found."

    lines = ["## Potential Citations\n"]
    for i, s in enumerate(sources, 1):
        title = s.get("paper_title", "Unknown")
        score = s.get("relevance_score", 0)
        page = s.get("page_number", "?")
        excerpt = s.get("excerpt", "")[:200]
        lines.append(f"{i}. **{title}** — relevance: {score:.2f}")
        lines.append(f"   - Source: p.{page}")
        if excerpt:
            lines.append(f"   - Excerpt: {excerpt}")

    return "\n".join(lines)


@mcp.tool()
async def add_paper_by_doi(doi: str, kb_id: int) -> str:
    """Add a paper to a knowledge base by its DOI. Fetches metadata from Crossref.

    Args:
        doi: The paper's DOI
        kb_id: Target knowledge base ID
    """
    from app.services.url_validator import validate_doi

    try:
        validate_doi(doi)
    except ValueError as e:
        return f"Error: {e}"

    from sqlalchemy import select

    async with get_session() as db:
        project = await db.get(Project, kb_id)
        if not project:
            return f"Error: Knowledge base {kb_id} not found."

        existing = (
            await db.execute(select(Paper).where(Paper.project_id == kb_id, Paper.doi == doi))
        ).scalar_one_or_none()

        if existing:
            return f"Paper already exists in KB (ID: {existing.id}, Title: {existing.title})"

        # Try Crossref lookup
        metadata = await _fetch_crossref_metadata(doi)

        paper = Paper(
            project_id=kb_id,
            doi=doi,
            title=metadata.get("title", f"DOI: {doi}"),
            abstract=metadata.get("abstract", ""),
            authors=metadata.get("authors"),
            journal=metadata.get("journal", ""),
            year=metadata.get("year"),
            source="crossref",
            source_id=doi,
        )
        db.add(paper)
        await db.flush()
        await db.refresh(paper)

        return f"""## Paper Added

- **Title**: {paper.title}
- **Paper ID**: {paper.id}
- **Status**: {paper.status}
- **KB**: {project.name} (ID: {kb_id})"""


async def _fetch_crossref_metadata(doi: str) -> dict:
    """Fetch paper metadata from Crossref API."""
    import httpx

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(f"https://api.crossref.org/works/{doi}")
            if resp.status_code == 200:
                data = resp.json()["message"]
                title_parts = data.get("title", [])
                title = title_parts[0] if title_parts else f"DOI: {doi}"

                authors = []
                for a in data.get("author", []):
                    name = f"{a.get('given', '')} {a.get('family', '')}".strip()
                    if name:
                        authors.append({"name": name})

                year = None
                date_parts = data.get("published-print", data.get("published-online", {})).get("date-parts", [[]])
                if date_parts and date_parts[0]:
                    year = date_parts[0][0]

                journal_names = data.get("container-title", [])
                journal = journal_names[0] if journal_names else ""

                abstract = data.get("abstract", "")

                return {
                    "title": title,
                    "authors": authors,
                    "year": year,
                    "journal": journal,
                    "abstract": abstract,
                }
    except Exception as e:
        logger.warning("Crossref lookup failed for %s: %s", doi, e)

    return {"title": f"DOI: {doi}"}


@mcp.tool()
async def get_paper_summary(paper_id: int, summary_type: str = "abstract") -> str:
    """Get a paper's summary (abstract or LLM-generated).

    Args:
        paper_id: The paper ID
        summary_type: 'abstract' for the original abstract, 'llm' for AI summary
    """
    async with get_session() as db:
        paper = await db.get(Paper, paper_id)
        if not paper:
            return f"Error: Paper {paper_id} not found."

        if summary_type not in ("abstract", "llm"):
            return f"Error: Unknown summary type '{summary_type}'. Use 'abstract' or 'llm'."

        if summary_type == "abstract":
            return f"""## Paper Summary

**{paper.title}**

{paper.abstract or "No abstract available."}"""

        if summary_type == "llm":
            return f"""## Paper Summary

**{paper.title}**

{paper.abstract or "No abstract available."}

(LLM summary requires an active LLM connection. Use the abstract above.)"""

        return f"Error: Unknown summary type '{summary_type}'. Use 'abstract' or 'llm'."


@mcp.tool()
async def search_papers_by_keyword(query: str, sources: str = "", max_results: int = 20) -> str:
    """Search for papers across academic databases (Semantic Scholar, OpenAlex, arXiv, Crossref).

    Args:
        query: Search keywords
        sources: Comma-separated data sources (semantic_scholar,openalex,arxiv,crossref). Empty = all.
        max_results: Maximum number of results (default 20, max 100)
    """
    if max_results < 1 or max_results > 100:
        return "Error: max_results must be between 1 and 100."

    from app.services.search_service import SearchService

    source_list = [s.strip() for s in sources.split(",") if s.strip()] if sources else None

    svc = SearchService()
    results = await svc.search(query=query, sources=source_list, max_results=max_results)

    papers_list = results.get("papers", [])
    if not papers_list:
        return "No results found."

    lines = [
        f"## Search Results ({len(papers_list)} papers)\n",
        "| Title | Authors | Year | DOI | Source |",
        "|---|---|---|---|---|",
    ]
    for p in papers_list[:30]:
        title = (p.get("title", "?"))[:80]
        authors = (p.get("authors", ""))[:40] if isinstance(p.get("authors"), str) else ""
        if isinstance(p.get("authors"), list):
            author_list = p["authors"]
            if author_list and isinstance(author_list[0], dict):
                authors = ", ".join(a.get("name", "") for a in author_list[:3])
            else:
                authors = ", ".join(str(a) for a in author_list[:3])
        year = p.get("year", "?")
        doi = p.get("doi", "")
        source = p.get("source", "?")
        lines.append(f"| {title} | {authors} | {year} | {doi} | {source} |")

    return "\n".join(lines)


@mcp.tool()
async def summarize_papers(kb_id: int, paper_ids: list[int] | None = None, language: str = "en") -> str:
    """Summarize papers in a knowledge base.

    Args:
        kb_id: Knowledge base ID
        paper_ids: Optional list of specific paper IDs to summarize. If empty, summarizes all.
        language: Output language (en/zh)
    """
    from app.services.writing_service import WritingService

    svc = WritingService()
    result = await svc.summarize(project_id=kb_id, paper_ids=paper_ids, language=language)
    return f"## Summary\n\n{result.get('content', 'No summary generated.')}"


@mcp.tool()
async def generate_review_outline(kb_id: int, topic: str, language: str = "en") -> str:
    """Generate a literature review outline based on papers in a knowledge base.

    Args:
        kb_id: Knowledge base ID
        topic: Research topic for the review
        language: Output language (en/zh)
    """
    from app.services.writing_service import WritingService

    svc = WritingService()
    result = await svc.generate_review_outline(project_id=kb_id, topic=topic, language=language)
    return f"## Review Outline\n\n{result.get('outline', 'No outline generated.')}"


@mcp.tool()
async def analyze_gaps(kb_id: int, research_topic: str) -> str:
    """Analyze research gaps in the literature of a knowledge base.

    Args:
        kb_id: Knowledge base ID
        research_topic: The research topic to analyze gaps for
    """
    from app.services.writing_service import WritingService

    svc = WritingService()
    result = await svc.analyze_gaps(project_id=kb_id, research_topic=research_topic)
    return f"## Gap Analysis\n\n{result.get('analysis', 'No gap analysis generated.')}"


@mcp.tool()
async def manage_keywords(kb_id: int, action: str = "list", term: str = "", language: str = "en") -> str:
    """Manage keywords for a knowledge base — list, add, expand, or delete.

    Args:
        kb_id: Knowledge base ID
        action: One of: list, add, expand, delete
        term: Keyword term (required for add/expand/delete)
        language: Language for keyword expansion (en/zh)
    """
    if action not in ("list", "add", "expand", "delete"):
        return "Error: action must be one of: list, add, expand, delete."

    from sqlalchemy import select

    from app.models.keyword import Keyword

    if action == "list":
        async with get_session() as db:
            stmt = select(Keyword).where(Keyword.project_id == kb_id).order_by(Keyword.level, Keyword.term)
            result = await db.execute(stmt)
            keywords = result.scalars().all()
        if not keywords:
            return "No keywords found in this knowledge base."
        lines = ["## Keywords\n", "| Term | EN | Level | Category |", "|---|---|---|---|"]
        for kw in keywords:
            lines.append(f"| {kw.term} | {kw.term_en} | {kw.level} | {kw.category} |")
        return "\n".join(lines)

    if not term:
        return f"Error: 'term' is required for action '{action}'."

    if action == "add":
        async with get_session() as db:
            kw = Keyword(project_id=kb_id, term=term, level=1)
            db.add(kw)
            await db.flush()
        return f"Added keyword: {term}"

    if action == "expand":
        from app.services.keyword_service import KeywordService

        svc = KeywordService()
        result = await svc.expand_keywords([term], language=language)
        expanded = result.get("expanded_terms", [])
        if not expanded:
            return "No expanded terms found."
        lines = [f"## Expanded from: {term}\n"]
        for et in expanded:
            lines.append(f"- {et.get('term', '')} ({et.get('relation', '')})")
        return "\n".join(lines)

    if action == "delete":
        async with get_session() as db:
            stmt = select(Keyword).where(Keyword.project_id == kb_id, Keyword.term == term)
            result = await db.execute(stmt)
            kw = result.scalar_one_or_none()
            if not kw:
                return f"Keyword '{term}' not found."
            await db.delete(kw)
        return f"Deleted keyword: {term}"

    return "Unknown action."


# ==================== RESOURCES ====================


@mcp.resource("omelette://knowledge-bases")
async def list_kb_resource() -> str:
    """List all knowledge bases as JSON."""
    from sqlalchemy import func, select

    async with get_session() as db:
        stmt = (
            select(
                Project.id,
                Project.name,
                Project.description,
                Project.domain,
                func.count(Paper.id).label("paper_count"),
            )
            .outerjoin(Paper, Paper.project_id == Project.id)
            .group_by(Project.id)
            .order_by(Project.updated_at.desc())
        )
        result = await db.execute(stmt)
        rows = result.all()

    kbs = [
        {
            "id": r.id,
            "name": r.name,
            "description": r.description,
            "domain": r.domain,
            "paper_count": r.paper_count,
        }
        for r in rows
    ]
    return json.dumps(kbs, ensure_ascii=False, indent=2)


@mcp.resource("omelette://knowledge-bases/{kb_id}")
async def get_kb_detail(kb_id: str) -> str:
    """Get knowledge base details."""
    from sqlalchemy import func, select

    try:
        kid = int(kb_id)
    except (ValueError, TypeError):
        return json.dumps({"error": f"Invalid knowledge base ID: {kb_id}"})

    async with get_session() as db:
        project = await db.get(Project, kid)
        if not project:
            return json.dumps({"error": f"Knowledge base {kb_id} not found"})

        paper_count = (await db.execute(select(func.count(Paper.id)).where(Paper.project_id == kid))).scalar() or 0

        chunk_count = (
            await db.execute(
                select(func.count(PaperChunk.id)).where(
                    PaperChunk.paper_id.in_(select(Paper.id).where(Paper.project_id == kid))
                )
            )
        ).scalar() or 0

    return json.dumps(
        {
            "id": project.id,
            "name": project.name,
            "description": project.description,
            "domain": project.domain,
            "paper_count": paper_count,
            "chunk_count": chunk_count,
        },
        ensure_ascii=False,
        indent=2,
    )


@mcp.resource("omelette://papers/{paper_id}")
async def get_paper_resource(paper_id: str) -> str:
    """Get paper details as JSON."""
    try:
        pid = int(paper_id)
    except (ValueError, TypeError):
        return json.dumps({"error": f"Invalid paper ID: {paper_id}"})

    async with get_session() as db:
        paper = await db.get(Paper, pid)
        if not paper:
            return json.dumps({"error": f"Paper {paper_id} not found"})

    authors_str = ""
    if paper.authors:
        authors_str = ", ".join(a.get("name", str(a)) if isinstance(a, dict) else str(a) for a in paper.authors)

    return json.dumps(
        {
            "id": paper.id,
            "title": paper.title,
            "authors": authors_str,
            "journal": paper.journal,
            "year": paper.year,
            "doi": paper.doi,
            "abstract": paper.abstract,
            "status": paper.status,
            "source": paper.source,
        },
        ensure_ascii=False,
        indent=2,
    )


@mcp.resource("omelette://papers/{paper_id}/chunks")
async def get_paper_chunks(paper_id: str) -> str:
    """Get paper text chunks (for RAG inspection)."""
    from sqlalchemy import select

    try:
        pid = int(paper_id)
    except (ValueError, TypeError):
        return json.dumps({"error": f"Invalid paper ID: {paper_id}"})

    async with get_session() as db:
        result = await db.execute(select(PaperChunk).where(PaperChunk.paper_id == pid).order_by(PaperChunk.chunk_index))
        chunks = result.scalars().all()

    if not chunks:
        return json.dumps({"paper_id": paper_id, "chunks": [], "message": "No chunks found"})

    chunk_list = [
        {
            "index": c.chunk_index,
            "content": c.content[:500],
            "page": c.page_number,
            "section": c.section,
        }
        for c in chunks
    ]
    return json.dumps(
        {"paper_id": paper_id, "total_chunks": len(chunks), "chunks": chunk_list},
        ensure_ascii=False,
        indent=2,
    )


# ==================== PROMPTS ====================


@mcp.prompt()
def literature_review(topic: str, kb_id: int, language: str = "en") -> str:
    """Generate a literature review prompt that guides AI to search and synthesize."""
    return f"""You are writing a literature review about "{topic}".
Use the search_knowledge_base tool to search knowledge base {kb_id} for relevant papers.
Organize the review with: 1) Background & Motivation 2) Key Methods 3) Applications & Limitations 4) Future Directions.
Language: {language}."""


@mcp.prompt()
def citation_finder(text: str, kb_id: int) -> str:
    """Generate a citation-finding prompt."""
    return f"""The following text needs academic citations. Use the find_citations tool to search knowledge base {kb_id}.
Text:
---
{text}
---
Mark citations as [1], [2], etc. and list references at the end."""


# ==================== STDIO ENTRY ====================

if __name__ == "__main__":
    mcp.run(transport="stdio")
