"""Three-stage deduplication: DOI hard dedup → title similarity → LLM verification."""

import logging
import re
import time
import unicodedata
from difflib import SequenceMatcher

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Paper, PaperStatus
from app.prompts.dedup import DEDUP_RESOLVE_SYSTEM, DEDUP_VERIFY_SYSTEM
from app.services.llm.client import LLMClient

logger = logging.getLogger(__name__)

# Common English stop words — removing these from titles improves fingerprint grouping accuracy
_ENGLISH_STOP_WORDS = frozenset(
    {
        "a",
        "an",
        "the",
        "and",
        "or",
        "but",
        "in",
        "on",
        "at",
        "to",
        "for",
        "of",
        "with",
        "by",
        "from",
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
        "being",
        "have",
        "has",
        "had",
        "do",
        "does",
        "did",
        "will",
        "would",
        "could",
        "should",
        "may",
        "might",
        "shall",
        "can",
        "need",
        "must",
        "that",
        "this",
        "these",
        "those",
        "it",
        "its",
        "as",
        "if",
        "when",
        "than",
        "then",
        "so",
        "no",
        "not",
        "only",
        "also",
        "into",
        "over",
        "such",
        "their",
        "they",
        "them",
        "we",
        "our",
        "you",
        "your",
        "he",
        "she",
        "his",
        "her",
        "what",
        "which",
        "who",
        "whom",
        "about",
        "between",
        "through",
        "during",
        "before",
        "after",
        "above",
        "below",
        "up",
        "down",
        "out",
        "off",
        "new",
        "using",
        "based",
    }
)


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


def title_fingerprint(title: str) -> frozenset[str]:
    """Create a content-word fingerprint from a title for fast pre-grouping.

    Normalizes the title, removes stop words, and returns a frozenset of
    remaining tokens. Papers with similar titles produce similar fingerprints.
    """
    normalized = DedupService.normalize_title(title)
    if not normalized:
        return frozenset()
    tokens = set(normalized.split()) - _ENGLISH_STOP_WORDS
    return frozenset(tokens)


def _group_by_fingerprint(papers: list[Paper]) -> dict[frozenset[str], list[Paper]]:
    """Group papers by their title fingerprint for efficient pairwise comparison.

    Uses exact fingerprint matching as the primary grouping, then also creates
    sub-groups by omitting one content word at a time. This ensures papers that
    differ by a single content word (e.g., "ML for X" vs "ML for X Y") are
    still compared, while keeping total comparisons far below O(N^2).
    """
    # Primary: exact fingerprint groups
    groups: dict[frozenset[str], list[Paper]] = {}
    for paper in papers:
        fp = title_fingerprint(paper.title)
        if not fp:
            continue
        groups.setdefault(fp, []).append(paper)

    # Secondary: for fingerprints with 2-5 words, also group by (N-1)-word subsets
    # This catches papers that differ by exactly one content word
    fp_to_papers: dict[frozenset[str], list[Paper]] = {}
    for fp, fp_papers in groups.items():
        for paper in fp_papers:
            fp_to_papers.setdefault(fp, []).append(paper)

    for fp, fp_papers in list(groups.items()):
        if 2 <= len(fp) <= 5:
            for paper in fp_papers:
                for omitted in fp:
                    sub_fp = frozenset(fp - {omitted})
                    if sub_fp:
                        groups.setdefault(sub_fp, []).append(paper)

    # Merge papers within each group (deduplicate by paper ID)
    merged: dict[frozenset[str], list[Paper]] = {}
    for fp, group_papers in groups.items():
        seen: dict[int, Paper] = {}
        for paper in group_papers:
            if paper.id not in seen:
                seen[paper.id] = paper
        if len(seen) > 1:
            merged[fp] = list(seen.values())

    return merged


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
        """Stage 2: Find papers with very similar titles (no DOI or different DOI).

        Uses token-fingerprint pre-grouping to reduce O(N^2) comparisons to
        only within groups with shared content words.
        """
        stmt = select(Paper).where(Paper.project_id == project_id).order_by(Paper.id)
        result = await self.db.execute(stmt)
        papers = list(result.scalars().all())

        start = time.monotonic()
        groups = _group_by_fingerprint(papers)
        total_comparisons = sum(len(g) * (len(g) - 1) // 2 for g in groups.values())
        logger.info(
            "title_similarity_dedup: %d papers → %d fingerprint groups, %d pairwise comparisons",
            len(papers),
            len(groups),
            total_comparisons,
        )

        removed_count = 0
        duplicates_info = []
        removed_ids: set[int] = set()

        for group in groups.values():
            for i in range(len(group)):
                if group[i].id in removed_ids:
                    continue
                for j in range(i + 1, len(group)):
                    if group[j].id in removed_ids:
                        continue

                    norm_a = self.normalize_title(group[i].title)
                    norm_b = self.normalize_title(group[j].title)

                    if not norm_a or not norm_b:
                        continue

                    similarity = 1.0 if norm_a == norm_b else SequenceMatcher(None, norm_a, norm_b).ratio()

                    if similarity >= threshold:
                        keep, remove = (
                            (group[i], group[j])
                            if group[i].citation_count >= group[j].citation_count
                            else (group[j], group[i])
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

        elapsed = time.monotonic() - start
        logger.info("title_similarity_dedup: removed %d duplicates in %.3fs", removed_count, elapsed)
        await self.db.flush()
        return {"removed": removed_count, "duplicates": duplicates_info}

    async def find_llm_dedup_candidates(self, project_id: int, threshold: float = 0.80) -> list[dict]:
        """Stage 3: Find candidate pairs for LLM-based verification (similarity 0.80-0.90).

        Uses token-fingerprint pre-grouping to reduce O(N^2) comparisons to
        only within groups with shared content words.
        """
        stmt = select(Paper).where(Paper.project_id == project_id).order_by(Paper.id)
        result = await self.db.execute(stmt)
        papers = list(result.scalars().all())

        start = time.monotonic()
        groups = _group_by_fingerprint(papers)
        total_comparisons = sum(len(g) * (len(g) - 1) // 2 for g in groups.values())
        logger.info(
            "find_llm_dedup_candidates: %d papers → %d fingerprint groups, %d pairwise comparisons",
            len(papers),
            len(groups),
            total_comparisons,
        )

        candidates = []
        for group in groups.values():
            for i in range(len(group)):
                for j in range(i + 1, len(group)):
                    norm_a = self.normalize_title(group[i].title)
                    norm_b = self.normalize_title(group[j].title)

                    if not norm_a or not norm_b:
                        continue

                    similarity = SequenceMatcher(None, norm_a, norm_b).ratio()

                    if threshold <= similarity < 0.90:
                        candidates.append(
                            {
                                "paper_a_id": group[i].id,
                                "paper_b_id": group[j].id,
                                "title_a": group[i].title,
                                "title_b": group[j].title,
                                "doi_a": group[i].doi,
                                "doi_b": group[j].doi,
                                "similarity": round(similarity, 3),
                            }
                        )

        elapsed = time.monotonic() - start
        logger.info("find_llm_dedup_candidates: found %d candidates in %.3fs", len(candidates), elapsed)
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
