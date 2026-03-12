# API Reference Overview

The Omelette backend exposes REST APIs under `/api/v1/`.

## Base URL

```
http://localhost:8000/api/v1
```

## Response Format

All endpoints return a consistent wrapper:

```json
{
  "code": 200,
  "message": "success",
  "data": { ... }
}
```

- `code` — HTTP-style status (200, 201, 400, 404, 500)
- `message` — Human-readable message
- `data` — Response payload (omit on 204-style success)

## Pagination

List endpoints use `PaginatedData`:

```json
{
  "items": [...],
  "total": 100,
  "page": 1,
  "page_size": 20,
  "total_pages": 5
}
```

## Async Tasks

Long-running operations (search, dedup, crawl, OCR, RAG build) return `task_id`. Poll status:

```
GET /api/v1/tasks/{task_id}
```

## Resources

| Resource | Base Path |
|----------|-----------|
| [Projects](/api/projects) | `/projects` |
| [Papers](/api/papers) | `/projects/{id}/papers` |
| [Keywords](/api/keywords) | `/projects/{id}/keywords` |
| [Search](/api/search) | `/projects/{id}/search` |
| [Dedup](/api/dedup) | `/projects/{id}/dedup` |
| [OCR](/api/ocr) | `/projects/{id}/ocr` |
| [Crawler](/api/crawler) | `/projects/{id}/crawl` |
| [Subscription](/api/subscription) | `/projects/{id}/subscriptions` |
| [RAG](/api/rag) | `/projects/{id}/rag` |
| [Writing](/api/writing) | `/projects/{id}/writing` |
| [Chat](/api/chat) | `/chat` |
| [Conversations](/api/conversations) | `/conversations` |
| [Settings](/api/settings) | `/settings` |
| [Tasks](/api/tasks) | `/tasks` |
| [Pipelines](/api/pipelines) | `/pipelines` |
