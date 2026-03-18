"""Three-stage deduplication: DOI hard dedup → title similarity → LLM verification."""

import logging
import re
import unicodedata
from difflib import SequenceMatcher

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Paper, PaperStatus
from app.prompts.dedup import DEDUP_RESOLVE_SYSTEM, DEDUP_VERIFY_SYSTEM
from app.services.llm.client import LLMClient

logger = logging.getLogger(__name__)


def _status_priority():
    """Order by status: indexed > ocr_complete > pdf_downloaded > metadata_only > pending."""
    return case(
        (Paper.status == PaperStatus.INDEXED, 5),
        (Paper.status == PaperStatus.OCR_COMPLETE, 4),
        (Paper.status == PaperStatus.PDF_DOWNLOADED, 3),
        (Paper.status == PaperStatus.METADATA_ONLY, 2),
        (Paper.status == PaperStatus.PENDING, 1),
        else_=0,
    ).desc()


class DedupService:
    def __init__(self, db: AsyncSession, llm: LLMClient | None = None):
        self.db = db
        self.llm = llm

    async def run_full_dedup(self, project_id: int) -> dict:
        """Run all 3 stages of dedup and return results."""
        from app.config import settings

        stage1 = await self.doi_hard_dedup(project_id)
        stage2 = await self.title_similarity_dedup(project_id, threshold=settings.dedup_title_hard_threshold)
        stage3_candidates = await self.find_llm_dedup_candidates(
            project_id, threshold=settings.dedup_title_llm_threshold
        )

        remaining = (
            await self.db.execute(select(func.count(Paper.id)).where(Paper.project_id == project_id))
        ).scalar() or 0

        return {
            "stage1_doi_removed": stage1["removed"],
            "stage2_title_removed": stage2["removed"],
            "stage3_candidates": len(stage3_candidates),
            "total_remaining": remaining,
            "details": {
                "doi_duplicates": stage1["duplicates"],
                "title_duplicates": stage2["duplicates"],
                "llm_candidates": stage3_candidates[:50],  # limit for response size
            },
        }

    async def doi_hard_dedup(self, project_id: int) -> dict:
        """Stage 1: Remove exact DOI duplicates, keeping the most recently updated."""
        stmt = (
            select(Paper.doi, func.count(Paper.id).label("cnt"))
            .where(Paper.project_id == project_id, Paper.doi.isnot(None), Paper.doi != "")
            .group_by(Paper.doi)
            .having(func.count(Paper.id) > 1)
        )
        result = await self.db.execute(stmt)
        duplicate_dois = result.all()

        removed_count = 0
        duplicates_info = []

        for doi, _count in duplicate_dois:
            papers_stmt = (
                select(Paper)
                .where(Paper.project_id == project_id, Paper.doi == doi)
                .order_by(_status_priority(), Paper.updated_at.desc())
            )
            papers = (await self.db.execute(papers_stmt)).scalars().all()

            keep = papers[0]
            for paper in papers[1:]:
                duplicates_info.append(
                    {
                        "kept_id": keep.id,
                        "removed_id": paper.id,
                        "doi": doi,
                        "reason": "doi_duplicate",
                    }
                )
                await self.db.delete(paper)
                removed_count += 1

        await self.db.flush()
        remaining = (
            await self.db.execute(select(func.count(Paper.id)).where(Paper.project_id == project_id))
        ).scalar() or 0

        return {"removed": removed_count, "remaining": remaining, "duplicates": duplicates_info}

    @staticmethod
    def normalize_title(title: str) -> str:
        """Normalize title for comparison: lowercase, remove punctuation/whitespace."""
        title = unicodedata.normalize("NFKD", title.lower())
        title = re.sub(r"[^\w\s]", "", title)
        title = re.sub(r"\s+", " ", title).strip()
        return title

    async def title_similarity_dedup(self, project_id: int, threshold: float = 0.90) -> dict:
        """Stage 2: Find papers with very similar titles (no DOI or different DOI)."""
        stmt = select(Paper).where(Paper.project_id == project_id).order_by(Paper.id)
        result = await self.db.execute(stmt)
        papers = list(result.scalars().all())

        removed_count = 0
        duplicates_info = []
        removed_ids: set[int] = set()

        for i in range(len(papers)):
            if papers[i].id in removed_ids:
                continue
            for j in range(i + 1, len(papers)):
                if papers[j].id in removed_ids:
                    continue

                norm_a = self.normalize_title(papers[i].title)
                norm_b = self.normalize_title(papers[j].title)

                if not norm_a or not norm_b:
                    continue

                similarity = 1.0 if norm_a == norm_b else SequenceMatcher(None, norm_a, norm_b).ratio()

                if similarity >= threshold:
                    keep, remove = (
                        (papers[i], papers[j])
                        if papers[i].citation_count >= papers[j].citation_count
                        else (papers[j], papers[i])
                    )

                    duplicates_info.append(
                        {
                            "kept_id": keep.id,
                            "removed_id": remove.id,
                            "similarity": round(similarity, 3),
                            "title_a": keep.title[:100],
                            "title_b": remove.title[:100],
                            "reason": "title_similarity",
                        }
                    )
                    await self.db.delete(remove)
                    removed_ids.add(remove.id)
                    removed_count += 1

        await self.db.flush()
        return {"removed": removed_count, "duplicates": duplicates_info}

    async def find_llm_dedup_candidates(self, project_id: int, threshold: float = 0.80) -> list[dict]:
        """Stage 3: Find candidate pairs for LLM-based verification (similarity 0.80-0.90)."""
        stmt = select(Paper).where(Paper.project_id == project_id).order_by(Paper.id)
        result = await self.db.execute(stmt)
        papers = list(result.scalars().all())

        candidates = []
        for i in range(len(papers)):
            for j in range(i + 1, len(papers)):
                norm_a = self.normalize_title(papers[i].title)
                norm_b = self.normalize_title(papers[j].title)

                if not norm_a or not norm_b:
                    continue

                similarity = SequenceMatcher(None, norm_a, norm_b).ratio()

                if threshold <= similarity < 0.90:
                    candidates.append(
                        {
                            "paper_a_id": papers[i].id,
                            "paper_b_id": papers[j].id,
                            "title_a": papers[i].title,
                            "title_b": papers[j].title,
                            "doi_a": papers[i].doi,
                            "doi_b": papers[j].doi,
                            "similarity": round(similarity, 3),
                        }
                    )

        return candidates

    async def llm_verify_duplicate(self, paper_a_id: int, paper_b_id: int) -> dict:
        """Use LLM to verify whether two papers are duplicates."""
        paper_a = await self.db.get(Paper, paper_a_id)
        paper_b = await self.db.get(Paper, paper_b_id)

        if not paper_a or not paper_b:
            return {"error": "Paper not found"}

        if not self.llm:
            return {"is_duplicate": False, "confidence": 0, "reason": "LLM not available"}

        prompt = f"""Compare these two papers and determine if they are the same work (possibly different versions):

Paper A:
- Title: {paper_a.title}
- DOI: {paper_a.doi or "N/A"}
- Authors: {paper_a.authors}
- Year: {paper_a.year}
- Journal: {paper_a.journal}

Paper B:
- Title: {paper_b.title}
- DOI: {paper_b.doi or "N/A"}
- Authors: {paper_b.authors}
- Year: {paper_b.year}
- Journal: {paper_b.journal}

Return JSON: {{"is_duplicate": true/false, "confidence": 0.0-1.0, "reason": "..."}}"""

        result = await self.llm.chat_json(
            messages=[
                {"role": "system", "content": DEDUP_VERIFY_SYSTEM},
                {"role": "user", "content": prompt},
            ],
            task_type="dedup_check",
        )
        return result

    async def resolve_conflict(
        self,
        old_paper: Paper,
        new_title: str,
        new_doi: str | None,
        new_year: int | None,
        new_journal: str | None,
    ) -> dict:
        """Use LLM to decide how to resolve a duplicate conflict."""
        if not self.llm:
            return {"action": "keep_new", "reason": "LLM not available, defaulting to keep_new"}

        prompt = f"""Two papers may be duplicates. Decide the best resolution:

Existing paper (in DB):
- ID: {old_paper.id}
- Title: {old_paper.title}
- DOI: {old_paper.doi or "N/A"}
- Year: {old_paper.year}
- Journal: {old_paper.journal}

New upload:
- Title: {new_title}
- DOI: {new_doi or "N/A"}
- Year: {new_year}
- Journal: {new_journal}

Return JSON: {{"action": "keep_old"|"keep_new"|"merge", "reason": "..."}}
- keep_old: existing is better, discard new
- keep_new: new is better or different work, add new
- merge: combine metadata, add as new paper"""

        try:
            result = await self.llm.chat_json(
                messages=[
                    {"role": "system", "content": DEDUP_RESOLVE_SYSTEM},
                    {"role": "user", "content": prompt},
                ],
                task_type="dedup_resolve",
            )
            action = result.get("action", "keep_new")
            if action not in ("keep_old", "keep_new", "merge"):
                action = "keep_new"
            return {"action": action, "reason": result.get("reason", "")}
        except Exception as e:
            logger.warning("LLM auto-resolve failed: %s", e)
            return {"action": "keep_new", "reason": f"Error: {e}"}
