# API Endpoints Reference

Base URL: `/api/v1`

## Module Overview

| Module | Endpoints | Description |
|--------|-----------|-------------|
| Papers | 24 | CRUD, search, bulk operations, reading sessions, analytics, export |
| Projects | 10 | CRUD, overview, pipeline triggers |
| Subscriptions | 9 | CRUD, trigger, quick update check |
| Collections | 8 | CRUD, paper add/remove, AI tag suggestions |
| Keywords | 7 | CRUD, bulk create, AI expand, search formula |
| Pipelines | 7 | Search/upload pipeline, status, cancel, resume |
| Reviews | 7 | CRUD, extractions, status management |
| RAG | 6 | Index, query, evidence consensus, chunk management |
| Writing | 6 | Assist, review draft (SSE), citations |
| Analysis | 5 | Contradictions, author network, trends, gaps, impact |
| Conversations | 5 | CRUD, messages |
| Dedup | 5 | Run, candidates, verify, resolve |
| API Keys | 4 | List, create, revoke, delete |
| Library | 4 | Health check, repair, auto-tag, cluster |
| Notifications | 4 | List, mark read, mark all read, dismiss |
| Team Members | 4 | List, invite, update role, remove |
| Audio Overviews | 3 | Generate, list, delete |
| Concepts | 3 | Extract, graph, topic page |
| Export | 3 | BibTeX, RIS, Zotero |
| Feed | 3 | Recommendations, refresh, feedback |
| Search | 3 | Execute, similar papers, source stats |
| Tasks | 3 | List, status, cancel |
| Crawler | 2 | Status, start download |
| OCR | 2 | Status, process |
| GPU | 2 | Status, unload models |
| Upload | 2 | Upload, browser extension capture |
| Chat | 2 | Send, stream (SSE) |
| Activities | 1 | List with filters |
| Analytics | 1 | Knowledge gaps |
| Rewrite | 1 | Text rewrite (SSE) |
| Settings | 5 | LLM config, health, test connection |
| **Total** | **153** | |

**Legend**: 🤖 LLM · 📄 File I/O · 🔄 SSE

## Common Patterns

### Response Format
```json
{"code": 200, "message": "ok", "data": {...}}
```

### Pagination
```
GET /papers?page=1&page_size=20
→ {"items": [...], "total": 100, "page": 1, "page_size": 20, "total_pages": 5}
```

### Project-Scoped Routes
Most endpoints are prefixed with `/projects/{project_id}/`. Examples:
- `GET /projects/1/papers` — list papers
- `POST /projects/1/search/execute` — execute search
- `GET /projects/1/analytics` — reading analytics

### Filtering
Paper endpoints support: `q` (search), `author`, `journal`, `status`, `reading_status`, `year`, `quality_tags`, `sort_by`, `order`.

## Detailed Documentation

Each module has a dedicated page in the [API Reference](/api/):
- [Papers](/api/papers) — full paper management
- [Search](/api/search) — federated academic search
- [Collections](/api/collections) — paper grouping
- [Keywords](/api/keywords) — term hierarchy
- [RAG](/api/rag) — vector indexing and retrieval
- [And more...](/api/)
