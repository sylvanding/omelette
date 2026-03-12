---
title: "Chat Message Routing Chain Rewrite — Monolith to LangGraph + AI SDK 5.0"
date: 2026-03-12
category: integration-issues
tags:
  - chat
  - langgraph
  - streaming
  - sse
  - vercel-ai-sdk
  - data-stream-protocol
  - refactor
  - useChat
severity: medium
components:
  - backend/app/api/v1/chat.py
  - backend/app/pipelines/chat/
  - frontend/src/hooks/use-chat-stream.ts
  - frontend/src/lib/chat-transport.ts
  - frontend/src/pages/PlaygroundPage.tsx
  - frontend/src/components/playground/MessageBubbleV2.tsx
  - frontend/src/types/chat.ts
  - backend/tests/test_chat_pipeline.py
symptoms: |
  Monolithic 250+ line _stream_chat function; manual SSE parsing on frontend
  with 15+ useState/useRef; brittle state management; hard to extend or test;
  custom non-standard SSE protocol.
root_cause: |
  Chat endpoint and frontend evolved incrementally without a structured
  streaming protocol or declarative state management. Backend lacked pipeline
  abstraction; frontend lacked a standard SSE consumption layer.
resolution: |
  Replaced with LangGraph StateGraph (6 nodes), Vercel AI SDK 5.0 Data Stream
  Protocol, and useChat hook. 23 pipeline tests added. Old endpoint removed.
---

# Chat Message Routing Chain Rewrite

## Problem

### Backend: monolithic `_stream_chat`

The chat endpoint was a single `_stream_chat` async generator (~250 lines) that handled every step inline: service initialization, conversation history loading, RAG retrieval, citation ranking, excerpt cleaning, LLM streaming, and persistence. Steps were tightly coupled, making unit testing and extension difficult.

SSE events used a non-standard format:

```
event: text_delta
data: {"delta": "Hello"}
```

### Frontend: manual SSE parsing + state explosion

PlaygroundPage used 15+ `useState`/`useRef` hooks for messages, streaming status, citations, thinking steps, pending deltas, flush timers, and abort refs. A custom `streamChat` async generator in `chat-api.ts` manually parsed SSE lines.

### Protocol mismatch

No standard protocol between backend and frontend. Each side maintained its own event format, making it brittle to extend with new event types.

## Root Cause Analysis

1. **No shared protocol** — backend and frontend each implemented their own SSE format
2. **Monolithic backend** — all chat logic in one function instead of a composable pipeline
3. **Frontend state explosion** — each streamed field managed with separate state
4. **No pipeline abstraction** — backend lacked graph-based orchestration
5. **Service wiring in wrong place** — LLM/RAG created inside stream logic instead of at endpoint layer

## Solution

### Architecture

```
Frontend (useChat)
  → DefaultChatTransport → POST /api/v1/chat/stream
    → FastAPI StreamingResponse
      → LangGraph StateGraph.astream(stream_mode="custom")
        → understand → [has KB?] → retrieve → rank → clean → generate → persist
                           └─ no KB ──────────────────────→ generate → persist
        → get_stream_writer() emits Data Stream Protocol events
```

### Backend: LangGraph StateGraph (6 nodes)

```python
# backend/app/pipelines/chat/graph.py
graph = StateGraph(ChatState)
graph.add_node("understand", understand_node)
graph.add_node("retrieve", retrieve_node)
graph.add_node("rank", rank_node)
graph.add_node("clean", clean_node)
graph.add_node("generate", generate_node)
graph.add_node("persist", persist_node)
graph.set_entry_point("understand")
graph.add_conditional_edges("understand", _route_after_understand,
    {"retrieve": "retrieve", "generate": "generate"})
# ... edges ...
return graph.compile()
```

Each node uses `get_stream_writer()` to emit Data Stream Protocol events:

```python
# In generate_node
writer = get_stream_writer()
writer({"type": "text-start", "id": text_id})
async for token in llm.chat_stream(messages):
    writer({"type": "text-delta", "id": text_id, "delta": token})
writer({"type": "text-end", "id": text_id})
```

### Protocol: Vercel AI SDK 5.0 Data Stream Protocol

```
data: {"type": "start", "messageId": "msg_xxx"}
data: {"type": "data-thinking", "data": {"step": "understand", ...}}
data: {"type": "text-start", "id": "text_xxx"}
data: {"type": "text-delta", "id": "text_xxx", "delta": "Hello"}
data: {"type": "text-end", "id": "text_xxx"}
data: {"type": "data-citation", "id": "cit-1", "data": {...}}
data: {"type": "data-conversation", "data": {"conversation_id": 123}}
data: {"type": "finish"}
data: [DONE]
```

### Frontend: `useChat` + custom transport

```typescript
// frontend/src/lib/chat-transport.ts
export function createChatTransport(options) {
  return new DefaultChatTransport<OmeletteUIMessage>({
    api: '/api/v1/chat/stream',
    prepareSendMessagesRequest({ messages, trigger }) {
      return {
        body: {
          message: getMessageText(lastUserMsg),
          knowledge_base_ids: options.knowledgeBaseIds ?? [],
          tool_mode: options.toolMode ?? 'qa',
          // ...
        },
      };
    },
  });
}
```

```typescript
// frontend/src/hooks/use-chat-stream.ts
const chat = useChat<OmeletteUIMessage>({
  transport,
  experimental_throttle: 80,
  // ...
});
const deferredMessages = useDeferredValue(chat.messages);
```

### Service injection via `_services` dict

Services (LLM, RAG) are created at the endpoint layer and passed via a shared mutable dict in `config["configurable"]["_services"]` so all graph nodes share the same instances.

```python
# Endpoint layer
services = await _init_services(db)
config = {"configurable": {"db": db, "_services": services}}

# Any node
llm = get_chat_llm(config)  # reads from _services dict
```

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| LangGraph StateGraph | Clear pipeline, conditional routing, easy to test/extend |
| `get_stream_writer()` + `stream_mode="custom"` | Nodes emit events directly; LangGraph handles streaming |
| Data Stream Protocol | Standard format compatible with `useChat` |
| Services at endpoint layer | Shared instances via `_services` dict; avoids deep-copy isolation |
| No checkpointer | Chat is stateless per request |
| `useDeferredValue` + `experimental_throttle: 80` | Reduces re-renders during streaming |
| `id`-based citation reconciliation | Same `data-citation` + same `id` → AI SDK updates existing Part |

## Issues Encountered During Implementation

### 1. LangGraph config deep-copy isolation

**Problem**: `config["configurable"]` is deep-copied between nodes. Services injected in `understand_node` weren't visible in downstream nodes.

**Fix**: Initialize services at the endpoint layer and pass them via `config["configurable"]["_services"]`. The `_services` dict itself is a nested mutable object that survives shallow copies.

### 2. FastAPI StreamingResponse + Depends(get_db)

**Problem**: DB session from `Depends(get_db)` can close before the streaming generator finishes.

**Fix**: For the endpoint, use `Depends(get_db)` but ensure the session lifecycle extends through the full streaming response. For tests, monkeypatch `_init_services` to avoid DB-dependent initialization.

### 3. SQLite test isolation

**Problem**: Streaming endpoint creates its own session that may not see tables created by test fixtures (different SQLite connections).

**Fix**: Monkeypatch `_init_services` to return mock LLM/RAG directly without querying `user_settings`.

### 4. LangGraph `stream_mode` tuple unpacking

**Problem**: `stream_mode=["custom"]` returns 2-tuples, but code expected 3-tuples.

**Fix**: Use `stream_mode="custom"` (string, not list) for single-mode streaming.

### 5. React duplicate key warning

**Problem**: `ThinkingChain` used `step.step` as key, but multiple thinking events can share the same step name.

**Fix**: Use `${step.step}-${index}` as key.

## Prevention Strategies

1. **Service injection**: Always initialize services at the entry point and share via a mutable container in config
2. **Streaming + DB**: Keep DB session creation inside the streaming generator; don't rely on dependency injection scoping
3. **Test design**: Mock heavy service initialization for streaming endpoint tests
4. **SDK versions**: Use string values for single-mode options; pin SDK versions
5. **React keys**: Use composite keys when items can repeat

## Common Pitfalls

| Pitfall | How to avoid |
|---------|-------------|
| Services not available in downstream nodes | Use shared `_services` dict initialized at endpoint |
| DB session closed mid-stream | Create session inside generator |
| Tests fail with "table not found" | Monkeypatch service init |
| Inconsistent stream tuple lengths | Use `stream_mode='custom'` (string) |
| React duplicate key warnings | Use `${type}-${index}` keys |

## Related Documents

- [LangGraph HITL Interrupt Pattern](langgraph-hitl-interrupt-api-snapshot-next.md)
- [Blocking Sync Calls — asyncio.to_thread](../performance-issues/blocking-sync-calls-asyncio-to-thread.md)
- [RAG Rich Citation Performance Analysis](../performance-issues/2026-03-12-rag-rich-citation-performance-analysis.md)
- [Chat Routing Chain Performance Analysis](../performance-issues/2026-03-12-chat-routing-chain-rewrite-performance-analysis.md)
- [Brainstorm](../../brainstorms/2026-03-12-chat-message-routing-chain-brainstorm.md)
- [Plan](../../plans/2026-03-12-feat-chat-message-routing-chain-rewrite-plan.md)
- [LangGraph Pipelines Rule](../../.cursor/rules/langgraph-pipelines.mdc)
