# Omelette Core Feature Optimization Analysis

## Executive Summary

After deep analysis of the codebase and comprehensive industry research, **4 major optimization areas** were identified that can significantly improve the quality and performance of the RAG pipeline, deduplication, and search workflows.

---

## 1. Chunking & Paragraph Segmentation (HIGHEST IMPACT)

### Current State

| Aspect | Current | Problem |
|--------|---------|---------|
| Chunk size | 1024 characters (hardcoded) | Not token-based; inconsistent with embedding model token limits |
| Split method | Paragraph boundaries (`\n\n`) | No sentence awareness; long paragraphs not subdivided |
| Token counting | `len(text.split())` (word count) | Incorrect for CJK languages; doesn't match tokenizer |
| Overlap | Last 100 words | Word-based overlap breaks sentences mid-thought |
| MinerU fallback | None | `marker-pdf` splits at fixed 2000 chars with 0 overlap |
| Image handling | `return_images="false"` | All figure/image content discarded |
| Chunk types | text, table, figure_caption | No abstract, introduction, conclusion, references |

### Research-Backed Recommendations

**Industry consensus for 2025-2026** (from [Firecrawl 2026](https://www.firecrawl.dev/blog/best-chunking-strategies-rag), [Weaviate 2025](https://weaviate.io/blog/chunking-strategies-for-rag), [Springer 2025](https://link.springer.com/article/10.1007/s10791-025-09638-7)):

1. **Token-based sizing (400-512 tokens)**: Chroma benchmarks show 88-89% recall at 400 tokens with recursive character splitting. Character counting is unreliable across languages.
2. **Sentence-aware splitting**: Split on sentence boundaries (`.`, `。`, `!`, `?`, `\n`) before paragraph boundaries.
3. **Semantic chunking for scientific papers**: Substack (Oct 2025) specifically recommends semantic chunking for research papers because topic shifts are subtle and not marked by headers.
4. **Page-level chunking for structured PDFs**: NVIDIA's 2024 tests showed page-level chunking had the lowest variance and 0.648 accuracy for paginated documents.
5. **Respect document structure**: Scientific papers have well-defined sections (abstract, intro, methods, results, discussion, references) — chunk boundaries should align with these.

### Concrete Optimization Plan

**Phase 1: Quick Wins (Low effort, high impact)**

```python
# 1. Token-based chunk size with tiktoken
import tiktoken
enc = tiktoken.get_encoding("cl100k_base")
token_count = len(enc.encode(text))  # Instead of len(text.split())

# 2. Sentence boundary splitting
import re
SENTENCE_PATTERN = r'(?<=[.。!?])\s+'  # Split on sentence endings
sentences = re.split(SENTENCE_PATTERN, paragraph)

# 3. Enable MinerU image extraction
# Change return_images from "false" to "true" in mineru_client.py
```

**Phase 2: Semantic Chunking (Medium effort, highest quality gain)**

Replace `_flush_text_chunk` with a semantic chunking approach:

```python
from sentence_transformers import SentenceTransformer

def semantic_chunk(text: str, threshold_percentile: float = 0.95) -> list[str]:
    """Split text where semantic similarity drops below threshold."""
    sentences = split_sentences(text)
    embeddings = model.encode(sentences)

    # Compute cosine similarity between adjacent sentences
    similarities = [
        cosine_similarity(embeddings[i], embeddings[i+1])
        for i in range(len(embeddings) - 1)
    ]

    # Find breakpoints where similarity drops below 95th percentile
    cutoff = np.percentile(similarities, 100 - (100 * (1 - threshold_percentile)))
    breakpoints = [i for i, s in enumerate(similarities) if s < cutoff]

    return split_at_breaks(sentences, breakpoints)
```

- **Cost**: ~2-3x more embedding compute (need to embed every sentence first)
- **Benefit**: Up to 9% recall improvement (Chroma research)
- **Best for**: High-value documents, abstract/introduction sections

**Phase 3: Structure-Aware Chunking (High effort, best for scientific papers)**

Leverage MinerU's section detection:

| Section | Chunk Strategy | Reason |
|---------|---------------|--------|
| Title/Abstract | 1 chunk (short, high-value) | Most important for retrieval |
| Introduction | Semantic chunking | Subtle topic shifts |
| Methods | Page-level or section-level | Procedural, needs full context |
| Results | Table-separated chunks | Data-heavy, tables are self-contained |
| Discussion | Semantic chunking | Argumentative flow |
| References | Skip or index separately | Low semantic value for Q&A |

```python
SECTION_PRIORITY = {
    "abstract": {"strategy": "single", "max_tokens": 512},
    "introduction": {"strategy": "semantic", "chunk_tokens": 400},
    "methods": {"strategy": "page", "chunk_tokens": 800},
    "results": {"strategy": "table-aware", "chunk_tokens": 512},
    "discussion": {"strategy": "semantic", "chunk_tokens": 400},
    "references": {"strategy": "skip", "index_metadata_only": True},
}
```

**Phase 4: Image/Multimodal Enhancement**

- Enable MinerU `return_images` to extract figures
- Generate CLIP embeddings for extracted figures
- Store figure embeddings in a separate ChromaDB collection
- Add vision model calls for figure description generation

---

## 2. Deduplication Optimization

### Current State

| Aspect | Current | Problem |
|--------|---------|---------|
| Stage 1 (DOI) | SQL GROUP BY | Fast, correct |
| Stage 2 (Title) | O(N^2) pairwise SequenceMatcher | **Quadratic scaling** — 1000 papers = 500K comparisons |
| Stage 3 (LLM) | Manual candidates 0.80-0.90 similarity | Narrow window, misses edge cases |
| Title normalization | Strip all punctuation | "BERT (Pre-training...)" → "bert pretraining" loses context |
| No vector similarity | String-only comparison | Misses semantically similar but differently-worded titles |
| Upload-time | DOI-only check | No title check during auto-import from search |

### Optimization Plan

**Phase 1: Token-based title fingerprinting (Quick win)**

Replace `SequenceMatcher` O(N^2) with hash-based pre-grouping:

```python
def title_fingerprint(title: str) -> set[str]:
    """Generate content fingerprint using sorted token set."""
    tokens = set(normalize_title(title).split())
    # Remove stop words
    tokens -= {"a", "an", "the", "of", "for", "on", "in", "and", "or"}
    return frozenset(tokens)

# Group papers by fingerprint — O(N) instead of O(N^2)
from collections import defaultdict
fingerprints = defaultdict(list)
for paper in papers:
    fp = title_fingerprint(paper.title)
    fingerprints[fp].append(paper)

# Only do SequenceMatcher within fingerprint groups
# For 1000 papers, this reduces comparisons from 500K to ~10K
```

**Phase 2: Embedding-based semantic dedup**

```python
# Use existing embedding service to compare title embeddings
title_embeddings = embedding_service.encode([p.title for p in papers])

# FAISS or Chroma similarity search for near-duplicates
# O(N log N) instead of O(N^2)
index = faiss.IndexFlatIP(title_embeddings.shape[1])
index.add(title_embeddings)
similarities = index.search(title_embeddings, k=5)  # Top 5 most similar
```

**Phase 3: Content-based PDF hash dedup**

```python
import hashlib

def pdf_content_hash(pdf_path: str) -> str:
    """Hash PDF content (excluding metadata) for upload-time dedup."""
    with open(pdf_path, 'rb') as f:
        # Skip metadata, hash only the page content streams
        reader = PyMuPDF.open(pdf_path)
        content = b''.join(page.get_text().encode() for page in reader)
    return hashlib.sha256(content).hexdigest()
```

Store `content_hash` in Paper model — catch identical PDFs with different filenames.

---

## 3. Similar Papers / Matching Optimization

### Current State

| Aspect | Current | Problem |
|--------|---------|---------|
| Vector computation | Mean of all chunk embeddings | Abstract/conclusion weighted same as references |
| ChromaDB query | n_results=limit+1 | Fetches too few, misses relevant papers |
| Distance aggregation | Simple average | Outlier chunks skew results |
| No cross-collection search | Per-project only | Can't find similar papers from other projects |

### Optimization Plan

**Phase 1: Weighted chunk averaging**

```python
SECTION_WEIGHTS = {
    "abstract": 3.0,
    "introduction": 2.0,
    "methods": 1.0,
    "results": 1.5,
    "discussion": 2.0,
    "conclusion": 2.5,
    "references": 0.0,  # Exclude from similarity
}

def weighted_paper_vector(chunks: list[dict]) -> list[float]:
    """Compute weighted mean of chunk embeddings."""
    vectors = []
    weights = []
    for chunk in chunks:
        section = chunk.get("section", "").lower()
        w = SECTION_WEIGHTS.get(section, 1.0)
        if w > 0:
            vectors.append(chunk["embedding"])
            weights.append(w)

    if not vectors:
        return None
    return np.average(vectors, axis=0, weights=weights).tolist()
```

**Phase 2: Median instead of mean for distance aggregation**

```python
# Current: avg_dist = sum(dists) / len(dists)
# Better: use median to be robust against outlier chunks
import statistics
median_dist = statistics.median(dists)
similarity = round(max(0, (1 - median_dist) * 100), 1)
```

**Phase 3: Hybrid search (semantic + keyword)**

```python
# Combine ChromaDB semantic search with BM25 keyword search
from rank_bm25 import BM25Okapi

# BM25 for exact term matching
corpus = [paper.title + " " + paper.abstract for paper in papers]
bm25 = BM25Okapi([c.split() for c in corpus])

# Weighted fusion: 0.7 * semantic + 0.3 * BM25
final_score = 0.7 * semantic_score + 0.3 * bm25_score
```

---

## 4. Image Encoding & Multimodal Processing

### Current State

| Aspect | Current | Gap |
|--------|---------|-----|
| OCR | PaddleOCR fallback only | No proactive image extraction from PDFs |
| Figure handling | Captions only as text | Figures themselves ignored |
| MinerU images | `return_images="false"` | Disabled entirely |
| PaddleOCR I/O | Temp PNG files on disk | Unnecessary disk I/O |
| No multimodal embeddings | No CLIP/vision models | Can't search by figure content |

### Optimization Plan

**Phase 1: Fix PaddleOCR I/O (Quick win)**

```python
# Current: page.get_pixmap(dpi=150) -> save to /tmp -> PaddleOCR(file) -> delete
# Better: page.get_pixmap(dpi=150) -> PIL.Image.frombytes -> PaddleOCR(image)

import io
from PIL import Image

pix = page.get_pixmap(dpi=150)
img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
# PaddleOCR accepts PIL Image directly — no disk I/O needed
result = ocr.ocr(img, cls=True)
```

**Phase 2: Enable MinerU image extraction**

```python
# mineru_client.py: Change return_images from "false" to "true"
payload = {
    "return_images": "true",  # Was "false"
    # ... other params
}
```

**Phase 3: Figure embedding with CLIP**

```python
from transformers import CLIPProcessor, CLIPModel

clip_model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
clip_processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")

def embed_figure(image_path: str) -> list[float]:
    image = Image.open(image_path)
    inputs = clip_processor(images=image, return_tensors="pt")
    with torch.no_grad():
        embedding = clip_model.get_image_features(**inputs)
    return embedding[0].tolist()

# Store in separate ChromaDB collection: project_{id}_figures
```

**Phase 4: Vision model for figure description**

```python
# Use LLM vision capability to describe figures
async def describe_figure(image_path: str) -> str:
    with open(image_path, "rb") as f:
        image_b64 = base64.b64encode(f.read()).decode()

    response = await llm.chat(
        messages=[{
            "role": "user",
            "content": [
                {"type": "text", "text": "Describe this scientific figure in detail."},
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_b64}"}}
            ]
        }]
    )
    return response
```

---

## 5. Workflow Pipeline Optimization

### Current State

| Aspect | Current | Problem |
|--------|---------|---------|
| LangGraph OCR node | Sequential (`for paper in papers:`) | Wastes GPU; background processor does parallel |
| Index node | Re-queries DB for chunks | Chunks already in session identity map |
| Two code paths | `paper_processor.py` vs `nodes.py` | Duplicated logic, inconsistent behavior |
| Search import dedup | DOI-only, O(N) per result | Should batch-check all DOIs at once |
| No PDF content hash | UUID filenames only | Same PDF can be uploaded twice |

### Optimization Plan

**Phase 1: Parallelize LangGraph OCR node**

```python
# Current (nodes.py, line 294-330):
# for paper in papers:  # Sequential!
#     result = await ocr_service.process(paper.pdf_path)

# Better:
async with OCRService() as ocr:
    results = await asyncio.gather(
        *[ocr.process(p.pdf_path) for p in papers],
        return_exceptions=True,
    )
```

**Phase 2: Batch DOI check for search import**

```python
# Current: N separate queries for each DOI
# Better: Single query
existing_dois = set(
    (await db.execute(
        select(Paper.doi).where(Paper.doi.in_(search_result_dois))
    )).scalars().all()
)

# Then filter in Python
new_papers = [p for p in search_results if p.doi not in existing_dois]
```

**Phase 3: Unify processing paths**

Create a shared `PaperProcessingService` that both the LangGraph nodes and background processor use:

```python
class PaperProcessingService:
    async def process_batch(
        self,
        papers: list[Paper],
        parallel: bool = True,
        gpu_semaphore: asyncio.Semaphore | None = None,
    ) -> list[ProcessingResult]:
        """Unified processing with parallel OCR support."""
        if parallel:
            return await self._process_parallel(papers, gpu_semaphore)
        else:
            return await self._process_sequential(papers)
```

---

## Priority Matrix

| Optimization | Impact | Effort | Priority |
|-------------|--------|--------|----------|
| Token-based chunk sizing | High | Low | **P0** |
| Sentence-aware splitting | High | Low | **P0** |
| Title fingerprint dedup | High | Low | **P0** |
| PaddleOCR in-memory | Medium | Low | **P1** |
| Enable MinerU images | Medium | Low | **P1** |
| Parallel LangGraph OCR | High | Medium | **P1** |
| Weighted chunk averaging | Medium | Medium | **P2** |
| Semantic chunking | Very High | High | **P2** |
| CLIP figure embeddings | Medium | High | **P3** |
| Structure-aware chunking | Very High | High | **P3** |
| Vision figure description | Medium | High | **P3** |
| Hybrid BM25+semantic search | Medium | Medium | **P2** |

---

## Sources

- [Firecrawl: Best Chunking Strategies for RAG in 2026](https://www.firecrawl.dev/blog/best-chunking-strategies-rag)
- [Weaviate: Chunking Strategies for RAG](https://weaviate.io/blog/chunking-strategies-for-rag)
- [Springer: Max-Min Semantic Chunking (2025)](https://link.springer.com/article/10.1007/s10791-025-09638-7)
- [ResearchGate: Systematic Investigation of Chunking Strategies (2025)](https://www.researchgate.net/publication/401721135)
- [Substack: Improve RAG Accuracy With Smarter Chunking (Oct 2025)](https://sarthakai.substack.com/p/improve-your-rag-accuracy-with-a)
- [Databricks: Mastering Chunking Strategies (Apr 2025)](https://community.databricks.com/t5/technical-blog/the-ultimate-guide-to-chunking-strategies-for-rag-applications/ba-p/113089)
