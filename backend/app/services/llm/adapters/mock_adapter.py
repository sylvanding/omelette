"""Mock chat model for testing without real LLM APIs."""

import json
from typing import Any

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatResult

MOCK_RESPONSES: dict[str, str] = {
    "keyword_expand": json.dumps(
        {
            "expanded_terms": [
                {"term": "STED microscopy", "term_zh": "受激发射损耗显微"},
                {"term": "STORM imaging", "term_zh": "随机光学重建显微"},
                {"term": "PALM microscopy", "term_zh": "光激活定位显微"},
                {"term": "structured illumination", "term_zh": "结构光照明"},
            ]
        }
    ),
    "summarize": "This paper presents a novel approach to super-resolution microscopy...",
    "dedup_check": json.dumps({"is_duplicate": False, "confidence": 0.85, "reason": "Different methodology"}),
    "augmented_reading_highlights": json.dumps(
        {
            "highlights": [
                {
                    "category": "Goal",
                    "text": "This paper aims to improve super-resolution imaging",
                    "page": 1,
                    "start_offset": 0,
                    "end_offset": 55,
                },
                {
                    "category": "Method",
                    "text": "We propose a novel deep learning approach",
                    "page": 2,
                    "start_offset": 100,
                    "end_offset": 145,
                },
                {
                    "category": "Result",
                    "text": "Our method achieves 2x resolution improvement",
                    "page": 5,
                    "start_offset": 200,
                    "end_offset": 250,
                },
            ]
        }
    ),
    "augmented_reading_citation_cards": json.dumps(
        {
            "citations": [
                {
                    "paper_id": 1,
                    "paper_title": "Deep Learning for Microscopy",
                    "tldr": "This paper introduces a deep learning method for enhancing microscopy resolution. Using a novel neural architecture, the authors achieve 2x improvement over traditional methods.",
                    "doi": "10.1234/test",
                },
            ]
        }
    ),
    "augmented_reading_definitions": json.dumps(
        {
            "definitions": [
                {
                    "term": "Super-resolution",
                    "definition": "Imaging techniques that achieve resolution beyond the diffraction limit of light.",
                    "context": "Used in microscopy to observe sub-cellular structures",
                },
                {
                    "term": "Point spread function",
                    "definition": "The response of an imaging system to a point source or point object.",
                    "context": "Characterizes the blur in optical systems",
                },
            ]
        }
    ),
    "evidence_consensus": json.dumps(
        {
            "papers": [
                {
                    "paper_id": 1,
                    "paper_title": "Deep Learning for Microscopy",
                    "stance": "support",
                    "finding": "Deep learning methods significantly improve microscopy resolution by 2x.",
                    "source_quote": "Our method achieves 2x resolution improvement over traditional approaches",
                    "confidence": 0.85,
                },
                {
                    "paper_id": 2,
                    "paper_title": "Limitations of AI in Imaging",
                    "stance": "contradict",
                    "finding": "AI-based approaches introduce artifacts that limit practical resolution gains.",
                    "source_quote": "Neural reconstruction introduces systematic artifacts that degrade image fidelity",
                    "confidence": 0.72,
                },
                {
                    "paper_id": 3,
                    "paper_title": "Hybrid Imaging Methods",
                    "stance": "mixed",
                    "finding": "Combining traditional and AI methods shows promise but results vary by sample type.",
                    "source_quote": "Hybrid approaches demonstrate variable success depending on specimen characteristics",
                    "confidence": 0.65,
                },
            ]
        }
    ),
    "contradiction_detection": json.dumps(
        {
            "contradictions": [
                {
                    "paper_a_id": 1,
                    "paper_a_title": "Deep Learning for Microscopy",
                    "paper_b_id": 2,
                    "paper_b_title": "Limitations of AI in Imaging",
                    "claim": "Deep learning improves microscopy resolution",
                    "position_a": "AI methods achieve 2x resolution improvement over traditional approaches",
                    "position_b": "Neural reconstruction introduces artifacts that degrade image fidelity",
                    "confidence": 0.88,
                    "topic": "Resolution Enhancement",
                },
                {
                    "paper_a_id": 1,
                    "paper_a_title": "Deep Learning for Microscopy",
                    "paper_b_id": 3,
                    "paper_b_title": "Hybrid Imaging Methods",
                    "claim": "Pure AI methods are sufficient for all samples",
                    "position_a": "Deep learning alone achieves superior results across all test cases",
                    "position_b": "Results vary significantly by specimen type, requiring hybrid approaches",
                    "confidence": 0.71,
                    "topic": "Method Applicability",
                },
            ],
            "topics": ["Resolution Enhancement", "Method Applicability"],
        }
    ),
    "smart_tagging": json.dumps(
        {
            "tags": [
                {
                    "paper_id": 1,
                    "suggested_tags": [
                        "deep learning",
                        "super-resolution",
                        "microscopy",
                        "neural networks",
                        "image enhancement",
                    ],
                },
                {
                    "paper_id": 2,
                    "suggested_tags": [
                        "AI limitations",
                        "image artifacts",
                        "neural reconstruction",
                        "image fidelity",
                        "evaluation",
                    ],
                },
                {
                    "paper_id": 3,
                    "suggested_tags": [
                        "hybrid methods",
                        "multi-modal imaging",
                        "sample variability",
                        "combined approaches",
                        "specimen analysis",
                    ],
                },
            ]
        }
    ),
    "review_extraction": json.dumps(
        {
            "extracted_data": {
                "sample_size": "150 participants",
                "methodology": "Randomized controlled trial",
                "outcome": "Significant improvement (p<0.05)",
                "limitations": "Single-center study with limited follow-up",
            },
            "confidence": 0.85,
        }
    ),
    "concept_extraction": json.dumps(
        {
            "concepts": [
                {
                    "name": "Deep Learning",
                    "definition": "Machine learning methods using multi-layer neural networks to learn hierarchical representations from data.",
                    "frequency": 3,
                    "related_papers": [1, 2, 3],
                },
                {
                    "name": "Super-resolution",
                    "definition": "Techniques for enhancing the resolution of images beyond the limits of the original sensor or acquisition system.",
                    "frequency": 2,
                    "related_papers": [1, 3],
                },
                {
                    "name": "Image Artifacts",
                    "definition": "Unwanted distortions or anomalies introduced during image processing or reconstruction that do not represent the true object.",
                    "frequency": 1,
                    "related_papers": [2],
                },
            ]
        }
    ),
    "concept_graph_building": json.dumps(
        {
            "related_concepts": [
                {
                    "concept_a": "Deep Learning",
                    "concept_b": "Super-resolution",
                    "relation_type": "applies_to",
                    "description": "Deep learning methods are applied to achieve super-resolution in imaging tasks.",
                },
                {
                    "concept_a": "Deep Learning",
                    "concept_b": "Image Artifacts",
                    "relation_type": "contrasts_with",
                    "description": "Deep learning approaches may introduce artifacts that contradict their intended quality improvements.",
                },
                {
                    "concept_a": "Super-resolution",
                    "concept_b": "Image Artifacts",
                    "relation_type": "related_to",
                    "description": "Super-resolution techniques must address and minimize image artifacts to be clinically useful.",
                },
            ]
        }
    ),
    "topic_page_generation": json.dumps(
        {
            "overview": "Deep Learning has revolutionized scientific imaging by enabling automatic feature extraction and pattern recognition at scales previously impossible. Multi-layer neural networks learn hierarchical representations from raw data, eliminating the need for hand-crafted features. In microscopy and medical imaging, deep learning approaches have demonstrated resolution improvements, automated cell detection, and anomaly classification with accuracy rivaling expert annotators.",
            "key_findings": [
                "Deep learning methods achieve 2x resolution improvement over traditional approaches",
                "Neural network architectures can automatically learn relevant features from raw microscopy data",
                "Transfer learning from natural images improves convergence on scientific imaging tasks",
                "Artifacts from neural reconstruction remain a challenge for clinical adoption",
            ],
            "related_topics": [
                "Neural Network Architecture",
                "Transfer Learning",
                "Image Reconstruction",
                "Feature Extraction",
            ],
            "research_directions": [
                "Explainable deep learning for scientific imaging",
                "Artifact-free neural reconstruction methods",
                "Few-shot learning for rare specimen types",
            ],
        }
    ),
    "library_auto_tag": json.dumps(
        {
            "tags": [
                {
                    "paper_id": 1,
                    "suggested_tags": [
                        "deep-learning",
                        "microscopy",
                        "image-enhancement",
                        "neural-networks",
                        "super-resolution",
                    ],
                },
                {
                    "paper_id": 2,
                    "suggested_tags": [
                        "ai-limitations",
                        "image-artifacts",
                        "neural-reconstruction",
                        "evaluation",
                        "image-fidelity",
                    ],
                },
                {
                    "paper_id": 3,
                    "suggested_tags": [
                        "hybrid-methods",
                        "multi-modal-imaging",
                        "sample-variability",
                        "combined-approaches",
                        "specimen-analysis",
                    ],
                },
            ]
        }
    ),
    "library_cluster_analysis": json.dumps(
        {
            "clusters": [
                {
                    "name": "Deep Learning for Imaging",
                    "description": "Papers focused on applying deep learning techniques to scientific imaging and microscopy tasks.",
                    "paper_ids": [1, 3],
                },
                {
                    "name": "AI Limitations and Evaluation",
                    "description": "Papers examining the limitations, artifacts, and evaluation challenges of AI-based imaging methods.",
                    "paper_ids": [2],
                },
            ]
        }
    ),
    "research_feed": json.dumps(
        {
            "recommendations": [
                {
                    "title": "Attention Mechanisms in Scientific Image Analysis",
                    "authors": "J. Smith, A. Chen",
                    "year": 2024,
                    "abstract": "This paper introduces transformer-based attention mechanisms for automated analysis of scientific microscopy images, achieving state-of-the-art segmentation accuracy.",
                    "doi": "10.5678/feed1",
                    "relevance_score": 0.92,
                    "reason": "Highly relevant to your reading history on deep learning for imaging",
                },
                {
                    "title": "Few-Shot Learning for Rare Specimen Classification",
                    "authors": "M. Kumar, L. Wang",
                    "year": 2024,
                    "abstract": "A meta-learning approach that achieves robust classification of rare biological specimens with as few as 5 training examples per class.",
                    "doi": "10.5678/feed2",
                    "relevance_score": 0.85,
                    "reason": "Extends your interest in sample variability and hybrid methods",
                },
                {
                    "title": "Self-Supervised Representation Learning for 3D Microscopy",
                    "authors": "R. Patel, S. Lee",
                    "year": 2023,
                    "abstract": "Leverages contrastive learning to learn 3D representations from unlabeled microscopy volumes, enabling downstream tasks with minimal supervision.",
                    "doi": "10.5678/feed3",
                    "relevance_score": 0.78,
                    "reason": "Complements your collection on deep learning for imaging",
                },
                {
                    "title": "Quantitative Evaluation of Neural Reconstruction Artifacts",
                    "authors": "T. Brown, K. Davis",
                    "year": 2024,
                    "abstract": "Systematic study of artifacts introduced by neural network-based image reconstruction across multiple microscopy modalities.",
                    "doi": "10.5678/feed4",
                    "relevance_score": 0.71,
                    "reason": "Addresses the AI limitations theme in your library",
                },
                {
                    "title": "Diffusion Models for Super-Resolution Microscopy",
                    "authors": "Y. Zhang, H. Kim",
                    "year": 2024,
                    "abstract": "Applies denoising diffusion probabilistic models to achieve 4x super-resolution in fluorescence microscopy without paired training data.",
                    "doi": "10.5678/feed5",
                    "relevance_score": 0.68,
                    "reason": "Novel approach to super-resolution beyond traditional methods",
                },
            ]
        }
    ),
    "default": "This is a mock LLM response for testing purposes.",
}


class MockChatModel(BaseChatModel):
    """Deterministic mock for CI and offline testing."""

    task_type: str = "default"

    @property
    def _llm_type(self) -> str:
        return "mock"

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> ChatResult:
        content = MOCK_RESPONSES.get(self.task_type, MOCK_RESPONSES["default"])
        return ChatResult(generations=[ChatGeneration(message=AIMessage(content=content))])
