# Security Audit: Config + RAG + API Testing Plan

**Plan**: [2026-03-17-refactor-config-rag-api-testing-plan.md](./2026-03-17-refactor-config-rag-api-testing-plan.md)
**Auditor**: security-sentinel
**Date**: 2026-03-17

---

## Executive Summary

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 2 | Must fix before implementation |
| High | 3 | Fix in Phase 2/3 |
| Medium | 4 | Recommended |
| Low | 2 | Nice to have |

**Overall**: The plan is implementable but requires specific security hardening before and during rollout. Critical issues center on resource exhaustion and test data isolation.

---

## 1. Input Validation on ChatStreamRequest

### 1.1 `rag_top_k` (Plan: `ge=1, le=50`)

**Status**: ✅ Plan specifies correct bounds.

**Recommendation**: Ensure the schema uses `Field(ge=1, le=50)` exactly. Current `ChatStreamRequest` does not yet have this field—add it per plan.

**Gap**: The **RAG API** (`RAGQueryRequest` in `backend/app/api/v1/rag.py`) has `top_k: int = 10` with **no validation**. An attacker can send `top_k=999999`.

**Action**: Add validation to `RAGQueryRequest`:

```python
# backend/app/api/v1/rag.py
class RAGQueryRequest(BaseModel):
    question: str
    top_k: int = Field(default=10, ge=1, le=50)
    use_reranker: bool = True
    include_sources: bool = True
```

### 1.2 `knowledge_base_ids` — Unbounded List

**Status**: ⚠️ **High risk**

**Finding**: `ChatStreamRequest.knowledge_base_ids: list[int] = Field(default_factory=list)` has **no max length**. A client can send hundreds of IDs, triggering one RAG query per ID in parallel.

**Impact**: With 50 KBs × 150 nodes (50×3 oversample) = 7,500 nodes per request. Combined with reranker calls, this can exhaust memory and GPU.

**Recommendation**:

```python
knowledge_base_ids: list[int] = Field(
    default_factory=list,
    max_length=20,  # or configurable via settings.rag_max_knowledge_bases
)
```

Add `rag_max_knowledge_bases: int = Field(default=20, ge=1, le=50)` to `config.py` and use it in the schema.

### 1.3 `message` Length

**Status**: ✅ `min_length=1` present. Consider `max_length` (e.g. 32_000) to cap context size and prevent abuse.

---

## 2. API Key Exposure in Test Fixtures

### 2.1 `.env.example`

**Status**: ✅ Safe

**Finding**: `.env.example` uses placeholders (`sk-sp-xxxxx`, `your-volcengine-api-key`, `your-email@example.com`). No real secrets.

**Recommendation**: Add a header comment:

```
# NEVER commit .env with real keys. .env is gitignored.
```

### 2.2 Real LLM Test Fixtures (Phase 3)

**Status**: ⚠️ **Medium risk**

**Finding**: Plan specifies `conftest_real_llm.py` and `LLM_PROVIDER=volcengine` for real LLM tests. Keys must come from environment, not from committed files.

**Recommendation**:

1. Document that `VOLCENGINE_API_KEY` must be set in the environment (or a local `.env` that is gitignored).
2. In `conftest_real_llm.py`, add a check:

   ```python
   if REAL_LLM_AVAILABLE and not os.environ.get("VOLCENGINE_API_KEY"):
       pytest.skip("VOLCENGINE_API_KEY required for real LLM tests")
   ```

3. Never log or print API keys. Ensure `LLMConfig` and provider clients do not log key values.

### 2.3 `test_llm_settings.py`

**Status**: ✅ Uses fake values (`sk-test`, `sk-ant-test`). Safe.

---

## 3. Resource Exhaustion via `rag_top_k=50` + Oversampling

### 3.1 Per-Query Cost

**Status**: ⚠️ **High risk**

**Finding**: With `rag_top_k=50` and `use_reranker=True`:
- `fetch_k = 50 × 3 = 150` nodes retrieved
- Reranker processes 150 query–document pairs (GPU-heavy)
- Adjacent chunk expansion adds more I/O per node

**Impact**: A single request can be expensive. Under 120 req/min global rate limit, sustained `rag_top_k=50` + `use_reranker=True` can saturate GPU and memory.

**Recommendations**:

1. **Cap effective top_k for reranker path** when oversampling is used:

   ```python
   # In rag_service.py
   EFFECTIVE_TOP_K_MAX = 20  # or from config
   if use_reranker and top_k > EFFECTIVE_TOP_K_MAX:
       top_k = min(top_k, EFFECTIVE_TOP_K_MAX)
   ```

   Or make `rag_default_top_k` and `rag_max_top_k` configurable (e.g. `rag_max_top_k=25`).

2. **Add `rag_oversample_factor` cap** in config: `ge=1, le=5` to avoid `top_k × 10` explosion.

3. **Consider stricter rate limits** for Chat/RAG endpoints (see Section 8).

---

## 4. GPU Resource Abuse via Repeated Reranker Calls

### 4.1 No Throttling on Reranker

**Status**: ⚠️ **High risk**

**Finding**: Plan uses `get_reranker()` with `lru_cache(maxsize=1)`. There is no semaphore or queue limiting concurrent reranker calls. Multiple concurrent Chat requests with `use_reranker=True` can overload the GPU.

**Recommendation**: Add a reranker semaphore:

```python
# backend/app/services/rag_service.py or reranker_service.py
_reranker_semaphore = asyncio.Semaphore(2)  # or from config.reranker_concurrency_limit

async def _rerank_nodes(self, nodes, query, top_n):
    async with _reranker_semaphore:
        # ... existing logic
```

Add `reranker_concurrency_limit: int = Field(default=2, ge=1, le=8)` to `config.py`.

### 4.2 Reranker `lru_cache` and `top_n`

**Finding**: `get_reranker(*, model_name, top_n)` is cached with `top_n` as part of the key. Different `top_n` values create separate instances. Consider caching only by `model_name` and passing `top_n` at inference time if the library supports it, to avoid multiple model loads.

---

## 5. Test Data Isolation

### 5.1 Unit/Integration Tests (pytest with ASGITransport)

**Status**: ✅ Isolated

**Finding**: `conftest.py` uses `tempfile.mkdtemp()` for `DATA_DIR` and `DATABASE_URL`. Tests use an ephemeral DB and data dir.

### 5.2 E2E Tests Against Live Server

**Status**: ⚠️ **Critical risk**

**Finding**: Plan says E2E tests "interact with live server" on port 8000. If the server uses production `.env` and `/data0/djx/omelette/`, tests will:
- Create real projects and papers
- Write to production ChromaDB
- Consume real LLM API credits

**Recommendation**:

1. **Dedicated E2E mode**: Start the server with `APP_ENV=testing`, `DATA_DIR=/tmp/omelette_e2e_XXX`, `DATABASE_URL=sqlite:////tmp/omelette_e2e.db`, and `CHROMA_DB_DIR` pointing to a temp dir.
2. **E2E startup script**:

   ```bash
   # scripts/run_e2e_server.sh
   export APP_ENV=testing
   export DATA_DIR=$(mktemp -d)
   export DATABASE_URL="sqlite:///$(mktemp -u)_e2e.db"
   export CHROMA_DB_DIR="$DATA_DIR/chroma_db"
   uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```

3. **Document**: E2E tests must never run against a production server. Add a check in E2E conftest:

   ```python
   if os.environ.get("APP_ENV") == "production":
       pytest.skip("E2E tests must not run against production")
   ```

### 5.3 Test PDFs at `/data0/djx/omelette_pdf_test/`

**Status**: ✅ Acceptable if path is read-only and used only for test fixtures. Ensure E2E does not write to this path; use a copy in a temp dir if needed.

---

## 6. `.env.example` — Secrets Check

**Status**: ✅ No real secrets

| Variable | Value | Verdict |
|----------|-------|---------|
| `APP_SECRET_KEY` | `change-me-to-a-random-secret-key` | Placeholder ✅ |
| `API_SECRET_KEY` | (empty) | Safe ✅ |
| `ALIYUN_API_KEY` | `sk-sp-xxxxx` | Placeholder ✅ |
| `VOLCENGINE_API_KEY` | `your-volcengine-api-key` | Placeholder ✅ |
| `OPENAI_API_KEY` | (empty) | Safe ✅ |
| `UNPAYWALL_EMAIL` | `your-email@example.com` | Placeholder ✅ |
| `HTTP_PROXY` | `http://127.0.0.1:20171/` | Environment-specific; consider removing or using placeholder |

**Recommendation**: Replace `HTTP_PROXY` with a placeholder like `http://localhost:PORT/` to avoid leaking local proxy config. Add a comment that proxy values are user-specific.

---

## 7. HNSW Parameter Injection via API

**Status**: ✅ No injection risk

**Finding**: HNSW parameters (`hnsw:construction_ef`, `hnsw:search_ef`, `hnsw:M`) are hardcoded in `RAGService._get_collection()`. No API endpoint accepts or forwards these values.

**Recommendation**: Keep HNSW params server-side only. If future config is needed, use `config.py` only, never request body or query params.

---

## 8. Rate Limiting on New Chat API Params

### 8.1 Current State

**Finding**: Global rate limit is `120/minute` (all endpoints). Chat and RAG use the same limit as lightweight CRUD endpoints.

### 8.2 Risk

**Status**: ⚠️ **Medium risk**

Chat with `rag_top_k=50` + `use_reranker=True` is far more expensive than a simple GET. An attacker can consume most of the budget with a few heavy Chat requests.

**Recommendation**:

1. **Stricter limit for Chat/RAG**:

   ```python
   # In chat.py and rag.py
   from app.middleware.rate_limit import limiter

   @router.post("/stream")
   @limiter.limit("30/minute")  # Lower than global for expensive ops
   async def chat_stream(...):
       ...
   ```

2. **Or** use a tiered approach: e.g. 120/min for normal endpoints, 20/min for Chat stream, 30/min for RAG query.

3. **Cost-aware limiting** (future): Weight requests by `rag_top_k` and `use_reranker` (e.g. 1 point for simple, 5 for heavy RAG).

---

## Remediation Roadmap

| Phase | Action | Priority |
|-------|--------|----------|
| Before Phase 2 | Add `rag_top_k`/`use_reranker` to ChatStreamRequest with `Field(ge=1, le=50)` | P0 |
| Before Phase 2 | Add `top_k` validation to RAGQueryRequest | P0 |
| Phase 2 | Cap `knowledge_base_ids` (max_length or config) | P0 |
| Phase 2 | Add reranker semaphore | P1 |
| Phase 2 | Consider `rag_max_top_k` when `use_reranker=True` | P1 |
| Phase 3 | E2E test isolation (dedicated env, temp dirs) | P0 |
| Phase 3 | Real LLM tests: require env vars, no key logging | P1 |
| Phase 4 | Stricter rate limits for Chat/RAG | P2 |
| Phase 4 | Clean `.env.example` proxy placeholder | P3 |

---

## Checklist for Implementation

- [ ] `ChatStreamRequest`: `rag_top_k` with `ge=1, le=50`; `use_reranker: bool`
- [ ] `ChatStreamRequest`: `knowledge_base_ids` with `max_length` or config-driven cap
- [ ] `RAGQueryRequest`: `top_k` with `Field(ge=1, le=50)`
- [ ] Reranker: semaphore for concurrent calls
- [ ] Config: `rag_max_knowledge_bases`, `reranker_concurrency_limit`, optionally `rag_max_top_k`
- [ ] E2E: Document and enforce test-only server env (APP_ENV=testing, temp DATA_DIR)
- [ ] Real LLM tests: Skip if API key missing; never log keys
- [ ] Rate limiting: Consider stricter limits for Chat/RAG
