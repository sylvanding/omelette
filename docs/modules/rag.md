# RAG Knowledge Base Module

ChromaDB vector indexing with hybrid retrieval and LLM-generated answers with citations.

## Features

- **Embeddings:** BAAI/bge-m3 via sentence-transformers
- **ChromaDB:** Vector store with metadata filtering
- **Hybrid retrieval:** Vector + BM25, optional reranker
- **Cited answers:** LLM responses with source citations

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/projects/{id}/rag/query` | Query knowledge base |
| POST | `/projects/{id}/rag/index` | Build/rebuild vector index |
| GET | `/projects/{id}/rag/stats` | Index statistics |
| DELETE | `/projects/{id}/rag/index` | Delete index |

## Usage Example

```bash
# Build index
curl -X POST http://localhost:8000/api/v1/projects/1/rag/index

# Query
curl -X POST http://localhost:8000/api/v1/projects/1/rag/query \
  -H "Content-Type: application/json" \
  -d '{"query": "What methods are used for attention?", "top_k": 10}'

# Stats
curl http://localhost:8000/api/v1/projects/1/rag/stats
```
