# RAG API

Base path: `/api/v1/projects/{project_id}/rag`

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/projects/{id}/rag/query` | Query knowledge base |
| POST | `/projects/{id}/rag/index` | Build/rebuild index |
| POST | `/projects/{id}/rag/index/stream` | Build index (SSE streaming progress) |
| GET | `/projects/{id}/rag/stats` | Index statistics |
| DELETE | `/projects/{id}/rag/index` | Delete index |

## Query Request

```json
{
  "question": "What is attention mechanism?",
  "top_k": 10,
  "use_reranker": true,
  "include_sources": true
}
```

- `question` — The question to answer (required)
- `top_k` — Number of chunks to retrieve (default: 10)
- `use_reranker` — Apply reranker for relevance (default: true)
- `include_sources` — Include source chunks in response (default: true)

## Query Response

```json
{
  "answer": "LLM-generated answer with citations",
  "sources": [
    {"paper_id": 1, "chunk_id": "...", "score": 0.9}
  ],
  "confidence": 0.0
}
```

## Index Stream (SSE)

`POST /projects/{id}/rag/index/stream` — Rebuild the vector index with Server-Sent Events for progress updates.

**Response:** `text/event-stream`

**Event types:**

| Event | Description | data |
|-------|-------------|------|
| `progress` | Indexing progress | `{ stage, percent, message? }` |
| `complete` | Indexing finished | `{ indexed, collection, papers_updated }` |
| `error` | Error occurred | `{ message }` |

## Delete Index

`DELETE /projects/{id}/rag/index` — Delete the vector index for the project. Returns `ApiResponse[dict]` with deletion result.
