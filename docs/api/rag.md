# RAG API

Base path: `/api/v1/projects/{project_id}/rag`

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/projects/{id}/rag/query` | Query knowledge base |
| POST | `/projects/{id}/rag/index` | Build/rebuild index |
| GET | `/projects/{id}/rag/stats` | Index statistics |
| DELETE | `/projects/{id}/rag/index` | Delete index |

## Query Request

```json
{
  "query": "What is attention mechanism?",
  "top_k": 10,
  "use_reranker": true
}
```

## Query Response

```json
{
  "answer": "LLM-generated answer with citations",
  "sources": [
    {"paper_id": 1, "chunk_id": "...", "score": 0.9}
  ]
}
```
