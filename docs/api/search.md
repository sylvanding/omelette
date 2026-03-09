# Search API

Base path: `/api/v1/projects/{project_id}/search`

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/projects/{id}/search/execute` | Execute federated search |
| GET | `/projects/{id}/search/sources` | List available sources |

## Execute Parameters

- `query` — Search string (or from project keywords if empty)
- `sources` — Optional: `semantic_scholar`, `openalex`, `arxiv`, `crossref`
- `max_results` — Per source (default: 100)
- `auto_import` — Import results into project (default: false)

## Response

```json
{
  "papers": [...],
  "total": 50,
  "imported": 45
}
```

Paper schema: `title`, `abstract`, `authors`, `doi`, `year`, `source`, `source_id`, `citation_count`, `pdf_url`.
