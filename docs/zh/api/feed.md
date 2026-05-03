> ⚠️ 本文档的中文翻译正在进行中。以下为英文原文。

# Feed API

Base path: `/api/v1/projects/{project_id}/feed`

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/projects/{id}/feed` | Get curated paper feed for a project |

## Feed

`GET /projects/{id}/feed` — Returns a curated feed of relevant papers based on the project's collection and user reading patterns.

**Query parameters:**
- `page`, `page_size` — Pagination

**Response fields:**
- `items[]` — Paper recommendations with relevance scores
- `total` — Total available items
- `page`, `page_size`, `total_pages` — Pagination metadata
