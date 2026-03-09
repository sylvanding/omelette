"""Writing assistance service — summarize, cite, outline, gap analysis."""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Paper
from app.services.llm_client import LLMClient
from app.services.rag_service import RAGService

logger = logging.getLogger(__name__)


class WritingService:
    def __init__(self, db: AsyncSession, llm: LLMClient, rag: RAGService | None = None):
        self.db = db
        self.llm = llm
        self.rag = rag

    async def summarize_papers(self, paper_ids: list[int], language: str = "en") -> list[dict]:
        """Generate summaries for selected papers."""
        summaries = []
        for paper_id in paper_ids:
            paper = await self.db.get(Paper, paper_id)
            if not paper:
                continue

            prompt = f"""Summarize this scientific paper in {language}:
Title: {paper.title}
Abstract: {paper.abstract}
Journal: {paper.journal}
Year: {paper.year}

Provide:
1. Core findings (2-3 sentences)
2. Methodology (1-2 sentences)
3. Innovation points
4. Limitations (if apparent from abstract)"""

            summary = await self.llm.chat(
                messages=[
                    {
                        "role": "system",
                        "content": "You are a scientific paper analyst. Provide concise, accurate summaries.",
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
                task_type="summarize",
            )

            summaries.append({
                "paper_id": paper.id,
                "title": paper.title,
                "summary": summary,
            })

        return summaries

    async def generate_citations(self, paper_ids: list[int], style: str = "gb_t_7714") -> list[dict]:
        """Generate formatted citations for papers."""
        citations = []
        for paper_id in paper_ids:
            paper = await self.db.get(Paper, paper_id)
            if not paper:
                continue

            authors = paper.authors or []
            author_str = ", ".join(a.get("name", "") for a in authors[:3])
            if len(authors) > 3:
                author_str += ", et al."

            if style == "gb_t_7714":
                citation = f"{author_str}. {paper.title}[J]. {paper.journal}, {paper.year or 'n.d.'}."
                if paper.doi:
                    citation += f" DOI: {paper.doi}."
            elif style == "apa":
                year_str = f"({paper.year})" if paper.year else "(n.d.)"
                citation = f"{author_str} {year_str}. {paper.title}. {paper.journal}."
                if paper.doi:
                    citation += f" https://doi.org/{paper.doi}"
            elif style == "mla":
                citation = f'{author_str}. "{paper.title}." {paper.journal}'
                if paper.year:
                    citation += f", {paper.year}"
                citation += "."
            else:
                citation = f"{author_str}. {paper.title}. {paper.journal}, {paper.year or 'n.d.'}."

            citations.append({
                "paper_id": paper.id,
                "citation": citation,
                "style": style,
                "doi": paper.doi,
            })

        return citations

    async def generate_review_outline(
        self, project_id: int, topic: str, language: str = "en"
    ) -> dict:
        """Generate a literature review outline based on project papers."""
        stmt = (
            select(Paper)
            .where(Paper.project_id == project_id)
            .order_by(Paper.citation_count.desc())
            .limit(20)
        )
        result = await self.db.execute(stmt)
        papers = result.scalars().all()

        paper_summaries = "\n".join([
            f"- {p.title} ({p.year}, {p.journal}) [cited:{p.citation_count}]"
            for p in papers
        ])

        prompt = f"""Generate a structured literature review outline in {language} on the topic: {topic}

Available papers:
{paper_summaries}

Provide:
1. Introduction & background
2. Main sections (3-5 thematic sections based on the papers)
3. Current gaps and challenges
4. Future directions
5. Conclusion

For each section, suggest which papers are most relevant."""

        outline = await self.llm.chat(
            messages=[
                {
                    "role": "system",
                    "content": "You are a scientific writing expert. Generate well-structured review outlines.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.5,
            task_type="default",
        )

        return {
            "topic": topic,
            "outline": outline,
            "paper_count": len(papers),
        }

    async def analyze_gaps(self, project_id: int, research_topic: str) -> dict:
        """Analyze research gaps in the project's literature."""
        stmt = (
            select(Paper)
            .where(Paper.project_id == project_id)
            .order_by(Paper.year.desc())
            .limit(30)
        )
        result = await self.db.execute(stmt)
        papers = result.scalars().all()

        paper_list = "\n".join([
            f"- [{p.year}] {p.title} (Journal: {p.journal})"
            for p in papers
        ])

        prompt = f"""Analyze the research gaps based on these papers in the field of: {research_topic}

Papers:
{paper_list}

Identify:
1. Under-explored sub-topics
2. Methodological gaps
3. Missing connections between sub-fields
4. Potential innovation points
5. Suggested research directions"""

        analysis = await self.llm.chat(
            messages=[
                {
                    "role": "system",
                    "content": "You are a research gap analyst. Identify unexplored areas and innovation opportunities.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.5,
            task_type="default",
        )

        return {
            "topic": research_topic,
            "analysis": analysis,
            "papers_analyzed": len(papers),
        }
