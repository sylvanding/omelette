"""Writing assistance service — summarize, cite, outline, gap analysis, literature review."""

import asyncio
import json
import logging
import re
from collections.abc import AsyncGenerator

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings as app_settings
from app.models import Paper
from app.prompts.writing import (
    WRITING_GAP_SYSTEM,
    WRITING_OUTLINE_SYSTEM,
    WRITING_SECTION_SYSTEM,
    WRITING_SUMMARIZE_SYSTEM,
)
from app.services.llm.client import LLMClient
from app.services.rag_service import RAGService

logger = logging.getLogger(__name__)

REVIEW_STYLES = {
    "narrative": "叙述性综述 (narrative review)：按主题逻辑串联文献，形成连贯论述",
    "systematic": "系统性综述 (systematic review)：按纳入/排除标准系统梳理，侧重方法学",
    "thematic": "主题性综述 (thematic review)：按研究主题分组对比，突出异同",
}


class WritingService:
    def __init__(self, db: AsyncSession, llm: LLMClient, rag: RAGService | None = None):
        self.db = db
        self.llm = llm
        self.rag = rag

    _summarize_semaphore = asyncio.Semaphore(app_settings.llm_parallel_limit)

    async def summarize_papers(self, paper_ids: list[int], language: str = "en") -> list[dict]:
        """Generate summaries for selected papers (parallelized with semaphore)."""
        stmt = select(Paper).where(Paper.id.in_(paper_ids))
        result = await self.db.execute(stmt)
        papers = {p.id: p for p in result.scalars().all()}

        async def _summarize_one(paper: Paper) -> dict:
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

            async with self._summarize_semaphore:
                summary = await self.llm.chat(
                    messages=[
                        {"role": "system", "content": WRITING_SUMMARIZE_SYSTEM},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.3,
                    task_type="summarize",
                )

            return {"paper_id": paper.id, "title": paper.title, "summary": summary}

        tasks = [_summarize_one(papers[pid]) for pid in paper_ids if pid in papers]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        return [r for r in results if isinstance(r, dict)]

    async def generate_citations(self, paper_ids: list[int], style: str = "gb_t_7714") -> list[dict]:
        """Generate formatted citations for papers."""
        stmt = select(Paper).where(Paper.id.in_(paper_ids))
        result = await self.db.execute(stmt)
        papers_map = {p.id: p for p in result.scalars().all()}

        citations = []
        for paper_id in paper_ids:
            paper = papers_map.get(paper_id)
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

            citations.append(
                {
                    "paper_id": paper.id,
                    "citation": citation,
                    "style": style,
                    "doi": paper.doi,
                }
            )

        return citations

    async def generate_review_outline(self, project_id: int, topic: str, language: str = "en") -> dict:
        """Generate a literature review outline based on project papers."""
        stmt = select(Paper).where(Paper.project_id == project_id).order_by(Paper.citation_count.desc()).limit(20)
        result = await self.db.execute(stmt)
        papers = result.scalars().all()

        paper_summaries = "\n".join([f"- {p.title} ({p.year}, {p.journal}) [cited:{p.citation_count}]" for p in papers])

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
                {"role": "system", "content": WRITING_OUTLINE_SYSTEM},
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
        stmt = select(Paper).where(Paper.project_id == project_id).order_by(Paper.year.desc()).limit(30)
        result = await self.db.execute(stmt)
        papers = result.scalars().all()

        paper_list = "\n".join([f"- [{p.year}] {p.title} (Journal: {p.journal})" for p in papers])

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
                {"role": "system", "content": WRITING_GAP_SYSTEM},
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

    async def generate_literature_review(
        self,
        project_id: int,
        topic: str = "",
        style: str = "narrative",
        citation_format: str = "numbered",
        language: str = "zh",
    ) -> AsyncGenerator[str, None]:
        """Generate a structured literature review draft with SSE events.

        Three-step pipeline: outline → per-section RAG → streamed draft.
        Yields SSE-formatted strings.
        """
        stmt = select(Paper).where(Paper.project_id == project_id).limit(50)
        result = await self.db.execute(stmt)
        papers = result.scalars().all()

        if not papers:
            yield _sse("error", {"message": "知识库中暂无文献，请先添加文献后再生成综述"})
            return

        yield _sse("progress", {"step": "outline", "message": "正在生成综述提纲..."})

        style_desc = REVIEW_STYLES.get(style, REVIEW_STYLES["narrative"])
        outline_result = await self._generate_review_outline_for_draft(papers, topic, style_desc, language)
        sections = _parse_outline_sections(outline_result)

        if not sections:
            sections = [{"title": topic or "综述", "query": topic or "literature review"}]

        yield _sse("outline", {"sections": [s["title"] for s in sections]})

        rag = self.rag or RAGService(llm=self.llm)
        global_citation_map: dict[int, dict] = {}
        citation_counter = 0

        for idx, section in enumerate(sections):
            yield _sse("section-start", {"title": section["title"], "section_index": idx})

            sources = await rag.retrieve_only(project_id, section["query"], top_k=8)
            section_refs: list[dict] = []
            for src in sources:
                pid = src.get("paper_id")
                if pid is not None and pid not in global_citation_map:
                    citation_counter += 1
                    global_citation_map[pid] = {
                        "number": citation_counter,
                        "paper_id": pid,
                        "title": src.get("paper_title", ""),
                    }
                section_refs.append(src)

            formatted_sources = self._format_sources_for_prompt(section_refs, global_citation_map)

            prompt = f"""章节标题：{section["title"]}

相关文献摘录：
{formatted_sources}

综述风格：{style_desc}
语言：{"中文" if language == "zh" else "English"}

请撰写该章节的综述段落。"""

            async for chunk in self.llm.chat_stream(
                messages=[
                    {"role": "system", "content": WRITING_SECTION_SYSTEM},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.5,
                max_tokens=2048,
                task_type="default",
            ):
                yield _sse("text-delta", {"delta": chunk, "section_index": idx})

            yield _sse("section-end", {"section_index": idx})

        yield _sse(
            "citation-map",
            {"citations": {str(v["number"]): v for v in global_citation_map.values()}},
        )
        yield _sse("done", {"total_sections": len(sections)})

    async def _generate_review_outline_for_draft(
        self,
        papers: list[Paper],
        topic: str,
        style_desc: str,
        language: str,
    ) -> str:
        paper_summaries = "\n".join(
            [f"- {p.title} ({p.year}, {p.journal}) [cited:{p.citation_count}]" for p in papers if p.title]
        )
        lang_str = "中文" if language == "zh" else "English"

        prompt = f"""请用{lang_str}为以下主题生成文献综述提纲。

主题：{topic or "（基于提供文献自动确定）"}
综述风格：{style_desc}

可用文献：
{paper_summaries}

要求：
1. 生成 3-6 个章节标题（用 ## 标记）
2. 每个章节标题后附一行简要描述
3. 包含引言和结论章节"""

        return await self.llm.chat(
            messages=[
                {"role": "system", "content": WRITING_OUTLINE_SYSTEM},
                {"role": "user", "content": prompt},
            ],
            temperature=0.5,
            task_type="default",
        )

    @staticmethod
    def _format_sources_for_prompt(sources: list[dict], citation_map: dict[int, dict]) -> str:
        lines = []
        for src in sources:
            pid = src.get("paper_id")
            ref_num = citation_map.get(pid, {}).get("number", "?") if pid else "?"
            title = src.get("paper_title", "Unknown")
            excerpt = src.get("excerpt", "")
            lines.append(f"[{ref_num}] {title}\n摘录：{excerpt}\n")
        return "\n".join(lines) if lines else "（无相关文献）"


def _parse_outline_sections(outline_text: str) -> list[dict]:
    """Parse markdown outline into structured sections."""
    sections = []
    current_title = None

    for line in outline_text.split("\n"):
        heading_match = re.match(r"^#{1,3}\s+(.+)", line.strip())
        if heading_match:
            if current_title:
                sections.append({"title": current_title, "query": current_title})
            current_title = heading_match.group(1).strip()
    if current_title:
        sections.append({"title": current_title, "query": current_title})

    return sections


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
