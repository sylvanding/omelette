---
title: "Chat Message Routing Chain Rewrite — Performance Analysis"
date: 2026-03-12
category: performance-issues
tags:
  - chat
  - langgraph
  - streaming
  - sse
  - useChat
  - performance
components:
  - backend/app/api/v1/chat.py
  - backend/app/pipelines/chat/
  - frontend/src/pages/PlaygroundPage.tsx
  - frontend/src/hooks/useChatStream.ts
severity: medium
origin: docs/plans/2026-03-12-feat-chat-message-routing-chain-rewrite-plan.md
---

# Chat Message Routing Chain Rewrite — Performance Analysis

## 1. Performance Summary

This analysis evaluates the performance implications of migrating from the current monolithic `_stream_chat` async generator to a LangGraph StateGraph with 7 nodes, Data Stream Protocol, and Vercel AI SDK `useChat`. The rewrite introduces additional abstraction layers; the key question is whether the overhead is acceptable for the target SLA (first token ≤ 2s, smooth streaming).

**Verdict**: The proposed architecture is **viable** with minor mitigations. Most overhead is in the **1–5ms per token** range and will be dominated by LLM latency (50–200ms/token). Critical mitigations: ensure `rank_node` batches Paper queries (current code already does), add optional frontend debounce if `useChat` causes jank, and validate LangGraph graph instance concurrency.

---

## 2. Concern-by-Concern Analysis

### 2.1 LangGraph Overhead: `get_stream_writer()` vs Direct Yield

| Dimension | Assessment |
|-----------|------------|
| **Mechanism** | Current: `yield _sse("text_delta", {"delta": token})` directly from generator. Proposed: `writer({"type":"text-delta", ...})` inside `generate_node` → LangGraph queues to `stream_mode="custom"` → caller `async for mode, chunk` yields to SSE. |
| **Overhead per token** | ~0.5–2ms (estimate) |
| **Breakdown** | 1) `writer()` call → ContextVar lookup + queue put. 2) LangGraph `astream` iteration → async queue get. 3) Caller `yield f'data: {json.dumps(chunk)}\n\n'` → same as current. |
| **Dominant cost** | LLM token latency (50–200ms typical) >> 1–2ms framework overhead. |

**Recommendation**:
- **Benchmark**: Add `t0 = time.monotonic()` before first `writer({"type":"text-delta",...})` and log `(time.monotonic() - t0) * 1000 / token_count` after generate completes. Target: < 2ms/token average.
- **Mitigation**: None required if benchmark confirms < 5ms/token. If higher, profile LangGraph internals (queue operations, ContextVar).

**Estimate**: Overhead adds **< 1%** to total stream time for typical 500-token responses.

---

### 2.2 State Serialization Between Nodes

| Dimension | Assessment |
|-----------|------------|
| **When serialization happens** | LangGraph merges node return dict into state and passes to next node. For TypedDict state, this is **in-process dict merge** — no pickle/JSON across process boundaries. |
| **Large fields** | `rag_results` (list of dicts, ~10–50 items × ~1KB each = 10–50KB), `citations` (similar), `full_messages` (system + history + user + context, 5–50KB). Total: ~50–150KB per state. |
| **Cost** | Dict merge + reference copy. Python dict operations are O(n) in field count; copying 50–150KB of nested dicts is ~0.1–0.5ms per node transition. |
| **Node transitions** | 5–7 transitions (understand → retrieve → rank → clean → generate → persist). Total: ~1–3ms. |

**Recommendation**:
- **Reduce state size**: Store `rag_results` / `citations` as references; avoid duplicating large blobs. LangGraph's reducer (if any) may copy; verify TypedDict default is shallow merge.
- **Lazy loading**: Consider storing `paper_ids` in state and fetching Paper metadata only in `rank_node`, not carrying full `rag_results` through every node.
- **Benchmark**: Log `len(json.dumps(state))` at each node entry; alert if > 200KB.

**Estimate**: 1–3ms total for full graph execution — negligible vs RAG (500ms–2s) and LLM (2–10s).

---

### 2.3 First Token Latency (TTFT)

| Dimension | Assessment |
|-----------|------------|
| **Current flow** | understand (DB + LLM init) → retrieve (RAG) → rank (Paper batch) → clean (LLM parallel) → generate (LLM stream). First token = after all pre-generate steps + first LLM chunk. |
| **Proposed flow** | Same DAG. LangGraph executes nodes sequentially; no parallelism change. |
| **Added latency** | 1) Graph setup: `get_chat_graph()` + `config` + `initial_state` — ~0.5ms. 2) Node dispatch overhead — ~0.2ms per node. 3) `stream_mode=["updates","custom"]` — first custom chunk is emitted as soon as `generate_node` yields first token to writer. |
| **Critical path** | TTFT = understand + retrieve + rank + clean + first LLM token. LangGraph adds ~2–5ms to this path. |

**Recommendation**:
- **Preserve parallelism**: Ensure `retrieve_node` uses `asyncio.gather()` for multi-KB RAG; `clean_node` uses `asyncio.gather()` for excerpt cleaning. Plan already specifies this.
- **No checkpointing for chat**: Do **not** enable LangGraph checkpointer for chat — it would add serialization on every node. Use `graph.compile()` without checkpointer.
- **Benchmark**: Measure TTFT (user send → first `text-delta` received) for both old and new endpoints. Plan target: ≤ 2s. If new endpoint exceeds by > 100ms, profile node dispatch.

**Estimate**: +2–5ms TTFT. Acceptable if baseline is 1.5–2s.

---

### 2.4 Frontend Re-renders: useChat vs 80ms Debounce

| Dimension | Assessment |
|-----------|------------|
| **Current** | 80ms debounce: `text_delta` events buffered, `setMessages` called at most every 80ms. ~12–15 state updates for 1s of streaming. |
| **useChat** | AI SDK parses SSE, updates `messages` state on each `text-delta` Part. **No built-in debounce** — each token can trigger a re-render. |
| **Impact** | 50 tokens/s → 50 React re-renders/s. Each re-render: MessageBubble, MarkdownRenderer (full re-parse), CitationCardList. Per RAG performance analysis: this is **high severity** — 500 tokens = 500 full Markdown parses. |
| **useChat internals** | SDK appends to `parts` array; React batches state updates within same tick, but each SSE message is a separate tick. Expect 1 re-render per `text-delta` unless SDK implements internal batching (unconfirmed). |

**Recommendation**:
- **P0 — Add debounce layer**: Wrap the streaming message's text in a debounced update before passing to MessageBubble. Options:
  1. **Custom hook**: `useDebouncedStreamingContent(message, delayMs=80)` — returns content that updates at most every 80ms.
  2. **useDeferredValue**: `const deferredContent = useDeferredValue(streamingContent)` — React 18 defers non-urgent updates; may reduce render frequency.
  3. **AI SDK option**: Check if `useChat` has `throttle` or `debounce` in v5; if not, file feature request.
- **P1 — MessageBubble memo**: Ensure `memo(MessageBubble)` and stable `citations`/`thinkingSteps` via `useMemo` so sibling messages don't re-render.
- **Benchmark**: Chrome Performance — measure Long Tasks during streaming. Target: < 50ms. If useChat causes 50+ re-renders/s and Long Tasks > 100ms, debounce is mandatory.

**Estimate**: Without debounce, **regression** vs current 80ms approach. With debounce, parity or better.

---

### 2.5 Memory Footprint

| Dimension | Assessment |
|-----------|------------|
| **State in memory** | ChatState holds: `rag_results`, `citations`, `enhanced_citations`, `full_messages`, `assistant_content`. Peak during generate: all of the above + streaming `assistant_content` (grows to ~2–10KB for 500 tokens). |
| **Per-request estimate** | ~100–200KB for typical RAG chat. 10 concurrent users = ~1–2MB. |
| **LangGraph overhead** | Graph definition is shared (compiled once). Per-invocation: state dict + node stack. Negligible. |
| **Risk** | Very long conversations (20+ turns) with large history_messages could bloat `full_messages`. Plan caps history at 10 (from current code). |

**Recommendation**:
- **Bound history**: Keep `history_messages[-10:]` as in current implementation.
- **Streaming content**: In `generate_node`, accumulate `assistant_content` in a string; avoid storing full token list. Current plan does this.
- **Monitor**: Add optional memory logging in dev: `import tracemalloc` at request start, `tracemalloc.get_traced_memory()` at end. Alert if > 5MB per request.

**Estimate**: 100–200KB/request. Safe for 50+ concurrent users on typical 4GB app process.

---

### 2.6 Concurrent Streams: Graph Instance Safety

| Dimension | Assessment |
|-----------|------------|
| **Graph lifecycle** | Plan: `graph = get_chat_graph()` — compiled once, reused. LangGraph compiled graphs are **stateless** — they don't hold request-specific data. |
| **Per-request data** | `config` (with `db`, `thread_id`) and `initial_state` are passed per `astream()` call. Each invocation gets its own execution context. |
| **ContextVar** | `get_stream_writer()` uses ContextVar — each async task has its own context. FastAPI spawns a new task per request. **Safe**. |
| **DB session** | `db` is request-scoped (`Depends(get_db)`). Each request has its own session. **Safe**. |

**Recommendation**:
- **No shared mutable state**: Ensure no global variables in nodes (e.g. don't cache LLM client in module scope per user). Plan injects `llm`/`rag` via `config["configurable"]` — correct.
- **Load test**: Run 10 concurrent streaming requests; verify no cross-talk (wrong messages to wrong users) and no connection/session errors.

**Estimate**: **Safe** for concurrent use. LangGraph and FastAPI patterns support this.

---

### 2.7 SSE Formatting: json.dumps Per Token

| Dimension | Assessment |
|-----------|------------|
| **Current** | `_sse("text_delta", {"delta": token})` → `json.dumps({"delta": "x"})` per token. ~20–30 bytes per token (single char) or ~50–100 bytes (word). |
| **Proposed** | Same: `json.dumps({"type":"text-delta","id":text_id,"delta":token})` — slightly larger (~60–80 bytes) due to `type` and `id`. |
| **Cost** | `json.dumps` for 80-byte dict: ~2–5 µs (microseconds) in CPython. 500 tokens = 1–2.5ms total. |
| **Comparison** | Network send of 80 bytes at 1Gbps = 0.0006ms. CPU cost dominates; still negligible. |

**Recommendation**:
- **No change needed**: `json.dumps` is not a bottleneck. If profiling ever shows it (unlikely), consider `orjson.dumps` (2–3×&nbsp;faster) or a pre-built f-string template for `text-delta` — only if proven hot.

**Estimate**: < 3ms total for 500-token response. **Negligible**.

---

## 3. Paper DB Query Batching (Correction)

The plan and user's "Current architecture" mention "No batching of Paper DB queries (N+1)". **The current `_stream_chat` already batches** (lines 169–173 in `chat.py`):

```python
paper_ids = list({pid for pid in (src.get("paper_id") for src in all_sources) if pid is not None})
if paper_ids:
    result = await db.execute(select(Paper).where(Paper.id.in_(paper_ids)))
    papers_by_id = {p.id: p for p in result.scalars().all()}
```

**Action**: Ensure `rank_node` in the new pipeline uses the same batch pattern. The plan's node table says "批量加载 Paper 元数据" — confirm implementation matches.

---

## 4. Recommended Actions (Prioritized)

| Priority | Action | Impact | Effort |
|----------|--------|--------|--------|
| P0 | Add frontend debounce (80ms) for streaming text if useChat updates per token | Prevents render jank, Long Tasks | Low |
| P0 | Verify `rank_node` batches Paper query (`Paper.id.in_(paper_ids)`) | Prevents N+1 regression | Low |
| P1 | Disable LangGraph checkpointer for chat graph | Avoids serialization overhead | Trivial |
| P1 | Benchmark TTFT: old vs new endpoint (target ≤ 2s) | Validates SLA | Low |
| P2 | Log state size at node boundaries in dev (`len(json.dumps(state))`) | Early warning for state bloat | Low |
| P2 | Optional: `useDeferredValue` for streaming content as secondary mitigation | May reduce render frequency | Low |
| P3 | Consider `orjson` for SSE if profiling shows json.dumps > 5% of stream time | Unlikely to be needed | Low |

---

## 5. Benchmark Checklist

Before/after comparison:

| Metric | Current | Target (New) | How to Measure |
|--------|---------|--------------|----------------|
| TTFT (send → first text-delta) | Baseline | ≤ baseline + 100ms | Backend log + frontend Performance API |
| Tokens per second (throughput) | Baseline | ≥ 90% of baseline | Count text-delta events / elapsed time |
| Frontend Long Tasks during stream | < 50ms | < 50ms | Chrome Performance, Long Task observer |
| Memory per request | — | < 500KB | tracemalloc or process memory diff |
| 10 concurrent streams | — | No errors, no cross-talk | Load test script |

---

## 6. Related Documents

- **Plan**: `docs/plans/2026-03-12-feat-chat-message-routing-chain-rewrite-plan.md`
- **RAG performance**: `docs/solutions/performance-issues/2026-03-12-rag-rich-citation-performance-analysis.md`
- **LangGraph rules**: `.cursor/rules/langgraph-pipelines.mdc`
