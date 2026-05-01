"""Keyword service — business logic for three-level keyword hierarchy and AI expansion."""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Keyword
from app.prompts.keyword import KEYWORD_EXPAND_SYSTEM
from app.services.llm.client import LLMClient

logger = logging.getLogger(__name__)

# Mock keyword expansion database — returns preset examples keyed by seed term.
# Covers common scientific domains so the feature is useful even without an LLM.
_MOCK_KEYWORD_DB: dict[str, list[dict]] = {
    "super-resolution": [
        {"term": "STED microscopy", "term_zh": "受激发射损耗显微", "relation": "related"},
        {"term": "STORM", "term_zh": "随机光学重建显微", "relation": "synonym"},
        {"term": "PALM", "term_zh": "光激活定位显微", "relation": "synonym"},
        {"term": "SIM", "term_zh": "结构光照明显微", "relation": "related"},
        {"term": "diffraction limit", "term_zh": "衍射极限", "relation": "related"},
        {"term": "nanoscopy", "term_zh": "纳米显微", "relation": "synonym"},
    ],
    "machine learning": [
        {"term": "deep learning", "term_zh": "深度学习", "relation": "related"},
        {"term": "neural network", "term_zh": "神经网络", "relation": "synonym"},
        {"term": "ML", "term_zh": "机器学习", "relation": "abbreviation"},
        {"term": "transfer learning", "term_zh": "迁移学习", "relation": "related"},
        {"term": "reinforcement learning", "term_zh": "强化学习", "relation": "related"},
        {"term": "self-supervised learning", "term_zh": "自监督学习", "relation": "related"},
    ],
    "gene editing": [
        {"term": "CRISPR", "term_zh": "基因编辑", "relation": "synonym"},
        {"term": "CRISPR-Cas9", "term_zh": "CRISPR-Cas9", "relation": "related"},
        {"term": "TALEN", "term_zh": "转录激活子样效应因子核酸酶", "relation": "related"},
        {"term": "ZFN", "term_zh": "锌指核酸酶", "relation": "related"},
        {"term": "base editing", "term_zh": "碱基编辑", "relation": "related"},
        {"term": "prime editing", "term_zh": "先导编辑", "relation": "related"},
    ],
    "cancer therapy": [
        {"term": "immunotherapy", "term_zh": "免疫治疗", "relation": "related"},
        {"term": "chemotherapy", "term_zh": "化疗", "relation": "related"},
        {"term": "targeted therapy", "term_zh": "靶向治疗", "relation": "related"},
        {"term": "radiotherapy", "term_zh": "放疗", "relation": "related"},
        {"term": "CAR-T", "term_zh": "CAR-T细胞疗法", "relation": "related"},
        {"term": "oncology", "term_zh": "肿瘤学", "relation": "related"},
    ],
    "drug delivery": [
        {"term": "nanoparticle", "term_zh": "纳米颗粒", "relation": "related"},
        {"term": "liposome", "term_zh": "脂质体", "relation": "related"},
        {"term": "targeted delivery", "term_zh": "靶向递送", "relation": "related"},
        {"term": "controlled release", "term_zh": "控释", "relation": "related"},
        {"term": "pharmacokinetics", "term_zh": "药代动力学", "relation": "related"},
        {"term": "bioavailability", "term_zh": "生物利用度", "relation": "related"},
    ],
}

# Generic fallback for terms not in the mock database
_MOCK_GENERIC_TEMPLATES = [
    {"term": "{term} methods", "term_zh": "{term}方法", "relation": "related"},
    {"term": "{term} techniques", "term_zh": "{term}技术", "relation": "related"},
    {"term": "{term} applications", "term_zh": "{term}应用", "relation": "related"},
    {"term": "{term} analysis", "term_zh": "{term}分析", "relation": "related"},
    {"term": "{term} review", "term_zh": "{term}综述", "relation": "related"},
    {"term": "{term} advances", "term_zh": "{term}进展", "relation": "related"},
]


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
        """Use LLM to expand seed keywords with synonyms and related terms.

        Falls back to mock data when LLM is unavailable or fails, ensuring the
        feature always returns useful results even in local/dev environments.
        """
        if not self.llm or self.llm.provider == "mock":
            return self._expand_keywords_mock(seed_terms, max_results)

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
                    {"role": "system", "content": KEYWORD_EXPAND_SYSTEM},
                    {"role": "user", "content": prompt},
                ],
                task_type="keyword_expand",
            )
            terms = result.get("expanded_terms", [])
            # If LLM returned empty, fall back to mock
            if not terms:
                logger.info("LLM returned empty expansion, falling back to mock data")
                return self._expand_keywords_mock(seed_terms, max_results)
            return terms
        except Exception as e:
            logger.warning("LLM keyword expansion failed (%s), falling back to mock data", e)
            return self._expand_keywords_mock(seed_terms, max_results)

    def _expand_keywords_mock(self, seed_terms: list[str], max_results: int = 20) -> list[dict]:
        """Return preset keyword expansions for use without a real LLM.

        Looks up each seed term in a curated mock database; for unknown terms,
        generates generic variants using simple templates.
        """
        results: list[dict] = []
        seen: set[str] = set()

        for seed in seed_terms:
            seed_lower = seed.lower().strip()
            # Try exact and partial match in mock database
            matched = None
            for key, terms in _MOCK_KEYWORD_DB.items():
                if key in seed_lower or seed_lower in key:
                    matched = terms
                    break

            if matched:
                for item in matched[: max_results // max(len(seed_terms), 1)]:
                    if item["term"] not in seen:
                        seen.add(item["term"])
                        results.append({**item, "seed_term": seed})
            else:
                # Generic fallback using templates
                per_seed = max_results // max(len(seed_terms), 1)
                for tmpl in _MOCK_GENERIC_TEMPLATES[:per_seed]:
                    term = tmpl["term"].format(term=seed)
                    if term not in seen:
                        seen.add(term)
                        results.append(
                            {
                                "term": term,
                                "term_zh": tmpl["term_zh"].format(term=seed),
                                "relation": tmpl["relation"],
                                "seed_term": seed,
                            }
                        )

        return results[:max_results]

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
