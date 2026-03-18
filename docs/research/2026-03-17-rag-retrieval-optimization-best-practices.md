# RAG Retrieval Optimization Best Practices (2025–2026)

**Context**: Academic paper retrieval, ChromaDB + HNSW, Qwen3-Embedding-0.6B (768 dim), Qwen3-Reranker-0.6B, LlamaIndex + FastAPI.

**Date**: 2026-03-17

---

## 1. Reranking Pipeline Design

### 1.1 Oversample → Rerank → MMR → Expand Pattern

**Recommended pipeline order** (community consensus + Vectara/OpenSearch docs):

```
Dense retrieval (oversample) → Rerank → MMR (optional) → Adjacent chunk expansion
```

- **Dense retrieval**: Fetch `top_k × oversample_factor` candidates.
- **Rerank**: Cross-encoder scores query–document pairs, returns top-k.
- **MMR**: Optional diversity pass on reranked results.
- **Adjacent expansion**: Expand selected chunks with prev/next chunks (your current design).

### 1.2 MMR: Before or After Reranking?

**Apply MMR after reranking.**

| Order | Rationale |
|-------|-----------|
| **Retrieve → Rerank → MMR** | Reranker provides relevance scores; MMR uses them to balance relevance vs diversity. |
| Retrieve → MMR → Rerank | MMR would operate on weaker similarity scores; reranker would then reorder, partially undoing diversity. |

**Source**: Mixpeek, OpenSearch, Elasticsearch Labs — MMR is a *reranking* stage that needs a candidate pool and relevance scores.

### 1.3 Oversampling Factor

| Factor | Use case | Latency | Quality |
|-------|----------|---------|---------|
| **2x** | Low latency | Lower | Good |
| **3–5x** | Balanced (recommended) | Medium | Better |
| **5–10x** | High precision | Higher | Best |

**Recommendation**: Start with **3x** (as in your plan). Research suggests 2–5x; 3x is a common default. Tune based on nDCG@10 and latency.

**Source**: Ailog RAG Guide 2025, TopK docs — 10–40% accuracy gains with oversampling.

### 1.4 Error Handling: Graceful Degradation

**Pattern** (matches your plan):

```python
async def _rerank_nodes(
    self,
    nodes: list[NodeWithScore],
    query: str,
    top_n: int,
) -> list[NodeWithScore]:
    """Apply reranker. Falls back to original order on any error."""
    try:
        reranker = get_reranker(top_n=top_n)
        return await asyncio.to_thread(
            reranker.postprocess_nodes, nodes, query_str=query
        )
    except Exception:
        logger.warning("Reranking failed, returning original nodes", exc_info=True)
        return nodes[:top_n]  # Truncate to top_n, preserve order
```

**Fallback strategies** (ChatNexus, Grizzly Peak):

1. **Primary**: Return original retrieval order (no reranking).
2. **Optional**: Retry with smaller batch (e.g. halve batch size on OOM).
3. **Optional**: Cache successful reranker results for reuse.
4. **Optional**: Fallback to lighter model (e.g. BGE-reranker if Qwen OOM).

**Must**: Catch and log; never fail the request.

---

## 2. MMR (Maximum Marginal Relevance) in Practice

### 2.1 Lambda Parameter

| λ | Effect | Use case |
|---|--------|----------|
| **0.0** | Max diversity | Exploratory search |
| **0.5** | Balanced | General (recommended) |
| **0.7–0.8** | Relevance-heavy | Factual QA |
| **1.0** | Max relevance | Pure relevance |

**Recommendation for academic papers**: **0.5–0.7** — diversity helps avoid redundant chunks from the same paper/section.

### 2.2 Paper-Level vs Chunk-Level Diversity

| Level | Strategy |
|-------|----------|
| **Chunk-level** | MMR on embedding similarity between chunks. |
| **Paper-level** | Deduplicate by `paper_id` before/after MMR; cap chunks per paper. |

**Recommendation**: Combine both:

1. **Chunk-level MMR**: Use LlamaIndex `vector_store_kwargs={"mmr_threshold": 0.5}`.
2. **Paper-level**: After MMR, optionally cap chunks per paper (e.g. max 2 per paper) or deduplicate by `paper_id` before final ranking.

### 2.3 Integration with Adjacent Chunk Expansion

**Order**: Rerank → MMR → Adjacent expansion.

- Adjacent expansion uses **paper_id** and **chunk_index** from selected chunks.
- MMR selects diverse chunks; expansion adds context around them.
- No conflict: MMR operates on chunk selection; expansion adds context to selected chunks.

---

## 3. HNSW Parameter Tuning for Academic Retrieval

### 3.1 768-Dim Vectors: Typical Values

| Parameter | Default | Recommended (academic) | Effect |
|-----------|---------|------------------------|--------|
| `ef_construction` | 100 | **150–200** | Higher recall, slower build |
| `ef_search` | 100 | **80–150** | Higher recall, slower queries |
| `max_neighbors` (M) | 16 | **24–32** | Higher recall, more memory |

**Recommendation for 768-dim academic retrieval**:

```python
configuration={
    "hnsw": {
        "space": "cosine",
        "ef_construction": 200,
        "ef_search": 100,
        "max_neighbors": 32,
    }
}
```

### 3.2 Trade-offs

| Increase | Recall | Latency | Memory |
|----------|--------|---------|--------|
| ef_construction | ↑ | Build time ↑ | ↑ |
| ef_search | ↑ | Query time ↑ | — |
| max_neighbors | ↑ | — | ↑ |

### 3.3 ChromaDB Configuration

**Chroma 1.0+** uses `configuration` (not `metadata`):

```python
collection = client.get_or_create_collection(
    name=f"project_{project_id}",
    configuration={
        "hnsw": {
            "space": "cosine",
            "ef_construction": 200,
            "ef_search": 100,
            "max_neighbors": 32,
        }
    },
)
```

**Note**: Chroma 0.6.x may use `metadata={"hnsw:space": "cosine"}`. Check your Chroma version; `configuration` is for Chroma 1.0+.

### 3.4 When to Rebuild Index

| Parameter | Mutable after creation? | Rebuild? |
|-----------|--------------------------|----------|
| `space` | No | Yes |
| `ef_construction` | No | Yes |
| `max_neighbors` | No | Yes |
| `ef_search` | **Yes** | No |

**Rebuild**: Delete collection and re-index when changing `space`, `ef_construction`, or `max_neighbors`.

---

## 4. Qwen3-Reranker Model Specifics

### 4.1 Sentence-Transformers CrossEncoder Compatibility

**Qwen3-Reranker does NOT work with standard SentenceTransformer CrossEncoder.**

- Architecture: `AutoModelForCausalLM` (yes/no token logits)
- Format: `"<Instruct>: ...\n<Query>: ...\n<Document>: ..."`
- Uses `token_true_id` / `token_false_id` ("yes"/"no") for relevance scoring

**Source**: [HuggingFace Qwen3-Reranker-0.6B](https://huggingface.co/Qwen/Qwen3-Reranker-0.6B), [LlamaIndex #19790](https://github.com/run-llama/llama_index/issues/19790).

### 4.2 Options for LlamaIndex Integration

| Option | Effort | Notes |
|-------|--------|-------|
| **Custom wrapper** | Medium | Extend `BaseNodePostprocessor`, implement Qwen format + `postprocess_nodes` |
| **Llama-server** | High | Convert to GGUF, run via `/v1/rerank` |
| **BGE-reranker** | Low | Use `BAAI/bge-reranker-v2-m3` with SentenceTransformerRerank |

**Custom wrapper sketch**:

```python
from llama_index.core.postprocessor import BaseNodePostprocessor
from transformers import AutoModelForCausalLM, AutoTokenizer

class Qwen3RerankerPostprocessor(BaseNodePostprocessor):
    def __init__(self, model_name: str = "Qwen/Qwen3-Reranker-0.6B", top_n: int = 10):
        self.tokenizer = AutoTokenizer.from_pretrained(model_name, padding_side="left")
        self.model = AutoModelForCausalLM.from_pretrained(model_name).eval()
        self.top_n = top_n
        # ... format_instruction, compute_logits logic from HuggingFace README

    def _postprocess_nodes(self, nodes, query_bundle):
        # Format pairs, call model, return top_n by score
        ...
```

### 4.3 GPU Memory & Batch

| Model | Approx. GPU memory (fp16) | Batch size (24GB) |
|-------|---------------------------|-------------------|
| **0.6B** | ~1.5–2 GB | 32–64 |
| **8B** | ~16–18 GB | 4–8 |

**0.6B**: Suitable for single GPUs; batch 16–32 for typical queries.

### 4.4 Input Format

```python
def format_instruction(instruction, query, doc):
    return f"<Instruct>: {instruction}\n<Query>: {query}\n<Document>: {doc}"

# Default instruction: "Given a web search query, retrieve relevant passages that answer the query"
# Custom instruction for academic: "Given a research question, retrieve relevant passages from academic papers"
```

---

## 5. Testing Reranking Quality

### 5.1 Metrics

| Metric | Use case |
|--------|----------|
| **nDCG@10** | Primary for reranking; ranking quality across top 10 |
| **MRR** | When first relevant result matters |
| **Precision@K** | % of top-K that are relevant |
| **Recall@K** | % of relevant docs in top-K |

**Recommendation**: Use **nDCG@10** as main metric for reranking; optionally MRR for QA-style evaluation.

### 5.2 A/B Testing

| Approach | Description |
|----------|-------------|
| **Dual pipeline** | Same query → baseline vs variant → compare nDCG@10 and latency |
| **User split** | Traffic split (e.g. 90/10) between variants |
| **Offline** | Evaluate on labeled query–document pairs before production |

**Metrics to track**: nDCG@10, MRR, latency p95, error rate.

### 5.3 Mock Reranker for Unit Tests

```python
from unittest.mock import MagicMock
from llama_index.core.schema import NodeWithScore, TextNode

def make_mock_reranker():
    """Returns a callable that mimics reranker.postprocess_nodes."""
    def mock_postprocess(nodes: list, query_str: str):
        # Return nodes in reverse order (simulates reranking) or with shuffled scores
        return list(reversed(nodes))[:10] if nodes else []
    return mock_postprocess

# In test:
with patch("app.services.reranker_service.get_reranker") as mock_get:
    mock_reranker = MagicMock()
    mock_reranker.postprocess_nodes.side_effect = lambda nodes, query_str: nodes[:5]
    mock_get.return_value = mock_reranker
    result = await rag.retrieve_only(project_id=1, question="test", top_k=5, use_reranker=True)
```

**Alternative**: Pass a `reranker` dependency to `RAGService` and inject a no-op or deterministic mock in tests.

---

## 6. Summary: Recommendations for Omelette

| Area | Recommendation |
|------|----------------|
| **Pipeline** | Retrieve (3× oversample) → Rerank → MMR (λ=0.5) → Adjacent expand |
| **Error handling** | Try/except in `_rerank_nodes`, return original order on failure |
| **Qwen3-Reranker** | Use custom wrapper or BGE-reranker; SentenceTransformerRerank not compatible |
| **HNSW** | ef_construction=200, ef_search=100, max_neighbors=32 |
| **Chroma** | Use `configuration` when on Chroma 1.0+ |
| **Testing** | Mock reranker in unit tests; nDCG@10 for evaluation |

---

## 7. Documentation Links

- [Chroma Configure Collections](https://docs.trychroma.com/docs/collections/configure)
- [Chroma Configuration Cookbook](https://cookbook.chromadb.dev/core/configuration/)
- [Qwen3-Reranker-0.6B HuggingFace](https://huggingface.co/Qwen/Qwen3-Reranker-0.6B)
- [Qwen3 Embedding Blog](https://qwenlm.github.io/blog/qwen3-embedding/)
- [LlamaIndex SentenceTransformerRerank](https://docs.llamaindex.ai/en/stable/examples/node_postprocessor/SentenceTransformerRerank/)
- [LlamaIndex #19790](https://github.com/run-llama/llama_index/issues/19790) — Qwen + LlamaIndex
- [Ailog RAG Reranking Guide 2025](https://app.ailog.fr/en/blog/guides/reranking)
- [Shaped A/B Testing Retrieval](https://www.shaped.ai/blog/ab-testing-retrieval-how-to-prove-your-agent-is-getting-better)
