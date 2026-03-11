"""Keyword service — business logic for three-level keyword hierarchy and AI expansion."""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Keyword
from app.services.llm_client import LLMClient

logger = logging.getLogger(__name__)


class KeywordService:
    def __init__(self, db: AsyncSession, llm: LLMClient | None = None):
        self.db = db
        self.llm = llm

    async def get_keyword_tree(self, project_id: int) -> list[dict]:
        """Build hierarchical keyword tree for a project."""
        stmt = select(Keyword).where(Keyword.project_id == project_id).order_by(Keyword.level, Keyword.id)
        result = await self.db.execute(stmt)
        keywords = result.scalars().all()

        kw_map = {}
        roots = []
        for kw in keywords:
            node = {
                "id": kw.id,
                "term": kw.term,
                "term_en": kw.term_en,
                "level": kw.level,
                "category": kw.category,
                "synonyms": kw.synonyms,
                "children": [],
            }
            kw_map[kw.id] = node
            if kw.parent_id and kw.parent_id in kw_map:
                kw_map[kw.parent_id]["children"].append(node)
            else:
                roots.append(node)
        return roots

    async def expand_keywords_with_llm(
        self, project_id: int, seed_terms: list[str], language: str = "en", max_results: int = 20
    ) -> list[dict]:
        """Use LLM to expand seed keywords with synonyms and related terms."""
        if not self.llm:
            return []

        prompt = f"""Given these seed keywords in scientific research: {seed_terms}
Language preference: {language}
Generate up to {max_results} related terms including:
- Synonyms and abbreviations
- Technical variants (e.g., STED, STORM, PALM for super-resolution)
- Cross-disciplinary application terms
- Chinese translations if applicable

Return JSON only:
{{"expanded_terms": [{{"term": "...", "term_zh": "...", "relation": "synonym|abbreviation|related|translation"}}]}}"""

        try:
            result = await self.llm.chat_json(
                messages=[
                    {"role": "system", "content": "You are a scientific terminology expert. Return valid JSON only."},
                    {"role": "user", "content": prompt},
                ],
                task_type="keyword_expand",
            )
            return result.get("expanded_terms", [])
        except Exception as e:
            logger.error("Keyword expansion failed: %s", e)
            return []

    async def generate_search_formula(self, project_id: int, database: str = "wos") -> dict:
        """Generate boolean search formula from project keywords for a specific database."""
        stmt = select(Keyword).where(Keyword.project_id == project_id).order_by(Keyword.level)
        result = await self.db.execute(stmt)
        keywords = result.scalars().all()

        if not keywords:
            return {"formula": "", "database": database, "keyword_count": 0}

        core_terms = []
        sub_terms = []
        expanded_terms = []

        for kw in keywords:
            terms = [kw.term_en or kw.term]
            if kw.synonyms:
                terms.extend([s.strip() for s in kw.synonyms.split(",") if s.strip()])

            if kw.level == 1:
                core_terms.extend(terms)
            elif kw.level == 2:
                sub_terms.extend(terms)
            else:
                expanded_terms.extend(terms)

        if database == "wos":
            formula = self._build_wos_formula(core_terms, sub_terms, expanded_terms)
        elif database == "scopus":
            formula = self._build_scopus_formula(core_terms, sub_terms, expanded_terms)
        elif database == "pubmed":
            formula = self._build_pubmed_formula(core_terms, sub_terms, expanded_terms)
        else:
            formula = self._build_generic_formula(core_terms, sub_terms, expanded_terms)

        return {
            "formula": formula,
            "database": database,
            "keyword_count": len(keywords),
            "core_terms": core_terms,
            "sub_terms": sub_terms,
            "expanded_terms": expanded_terms,
        }

    def _build_wos_formula(self, core: list[str], sub: list[str], expanded: list[str]) -> str:
        parts = []
        if core:
            parts.append("TS=(" + " OR ".join(f'"{t}"' for t in core) + ")")
        if sub:
            parts.append("TS=(" + " OR ".join(f'"{t}"' for t in sub) + ")")
        if expanded:
            parts.append("TS=(" + " OR ".join(f'"{t}"' for t in expanded) + ")")
        return " AND ".join(parts) if parts else ""

    def _build_scopus_formula(self, core: list[str], sub: list[str], expanded: list[str]) -> str:
        parts = []
        if core:
            parts.append("TITLE-ABS-KEY(" + " OR ".join(f'"{t}"' for t in core) + ")")
        if sub:
            parts.append("TITLE-ABS-KEY(" + " OR ".join(f'"{t}"' for t in sub) + ")")
        return " AND ".join(parts) if parts else ""

    def _build_pubmed_formula(self, core: list[str], sub: list[str], expanded: list[str]) -> str:
        all_terms = core + sub + expanded
        return " OR ".join(f'"{t}"[Title/Abstract]' for t in all_terms)

    def _build_generic_formula(self, core: list[str], sub: list[str], expanded: list[str]) -> str:
        all_terms = core + sub + expanded
        return " OR ".join(f'"{t}"' for t in all_terms)
