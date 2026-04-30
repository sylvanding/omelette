"""Evidence consensus service: classifies paper stances on a research question."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.services.llm.client import LLMClient

logger = logging.getLogger(__name__)

EVIDENCE_CONSENSUS_SYSTEM = (
    "You are an evidence analysis assistant. "
    "Given a research question and excerpts from scientific papers, classify each paper's "
    "stance as 'support', 'contradict', or 'mixed' relative to the research question. "
    "Also extract a one-line finding and a relevant source quote. "
    "Return ONLY valid JSON with the structure: "
    '{"papers": [{"paper_id": 1, "paper_title": "...", "stance": "support|contradict|mixed", '
    '"finding": "one-line summary", "source_quote": "relevant excerpt", "confidence": 0.85}]}'
)


class EvidenceConsensusService:
    """Service for analyzing evidence consensus across papers on a research question."""

    def __init__(self, llm: LLMClient):
        self.llm = llm

    async def analyze_consensus(self, question: str, papers: list[dict]) -> dict:
        """Analyze how papers support or contradict a research question.

        Args:
            question: The research question to evaluate.
            papers: List of dicts with paper_id, title, and content (abstract/excerpt).

        Returns:
            Dict with support/contradict/mixed counts, percentages, per-paper findings,
            and overall confidence score.
        """
        if not papers:
            return {
                "support_count": 0,
                "contradict_count": 0,
                "mixed_count": 0,
                "total_papers": 0,
                "support_percentage": 0.0,
                "contradict_percentage": 0.0,
                "mixed_percentage": 0.0,
                "papers": [],
                "overall_confidence": 0.0,
            }

        # Truncate each paper to avoid token overflow
        paper_texts = []
        for p in papers[:15]:
            content = (p.get("content") or "")[:1500]
            paper_texts.append(f"Paper ID: {p['paper_id']}\nTitle: {p.get('title', '')}\nContent: {content}")

        messages = [
            {"role": "system", "content": EVIDENCE_CONSENSUS_SYSTEM},
            {
                "role": "user",
                "content": f"Research question: {question}\n\nPapers to analyze:\n\n" + "\n\n---\n\n".join(paper_texts),
            },
        ]

        try:
            result = await self.llm.chat_json(
                messages,
                temperature=0.3,
                task_type="evidence_consensus",
            )
            paper_results = result.get("papers", [])

            valid_stances = {"support", "contradict", "mixed"}
            findings = []
            for p in paper_results[:15]:
                stance = (p.get("stance") or "mixed").lower()
                if stance not in valid_stances:
                    stance = "mixed"
                findings.append(
                    {
                        "paper_id": p.get("paper_id"),
                        "paper_title": p.get("paper_title", ""),
                        "stance": stance,
                        "finding": (p.get("finding") or "")[:300],
                        "source_quote": (p.get("source_quote") or "")[:500],
                        "confidence": min(1.0, max(0.0, float(p.get("confidence", 0.5)))),
                    }
                )

            support_count = sum(1 for f in findings if f["stance"] == "support")
            contradict_count = sum(1 for f in findings if f["stance"] == "contradict")
            mixed_count = sum(1 for f in findings if f["stance"] == "mixed")
            total = len(findings) if findings else 1

            overall_confidence = round(sum(f["confidence"] for f in findings) / len(findings), 3) if findings else 0.0

            return {
                "support_count": support_count,
                "contradict_count": contradict_count,
                "mixed_count": mixed_count,
                "total_papers": len(findings),
                "support_percentage": round(support_count / total * 100, 1),
                "contradict_percentage": round(contradict_count / total * 100, 1),
                "mixed_percentage": round(mixed_count / total * 100, 1),
                "papers": findings,
                "overall_confidence": overall_confidence,
            }

        except Exception:
            logger.exception("Failed to analyze evidence consensus")
            return {
                "support_count": 0,
                "contradict_count": 0,
                "mixed_count": 0,
                "total_papers": 0,
                "support_percentage": 0.0,
                "contradict_percentage": 0.0,
                "mixed_percentage": 0.0,
                "papers": [],
                "overall_confidence": 0.0,
            }
