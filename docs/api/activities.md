# Activities API

Base path: `/api/v1/projects/{project_id}/activities`

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/projects/{id}/activities` | List activity log entries (paginated) |

## Query Parameters

- `page`, `page_size` — Pagination
- `action` — Filter by action type (e.g. `paper_added`, `paper_processed`)
- `entity_type` — Filter by entity type (e.g. `paper`, `project`)

## Activity Log Schema

```json
{
  "id": 1,
  "project_id": 1,
  "action": "paper_added",
  "entity_type": "paper",
  "entity_id": 42,
  "description": "Paper added via upload",
  "created_at": "2024-01-15T10:00:00Z"
}
```

## Response Format

Paginated response with `items`, `total`, `page`, `page_size`, and `total_pages` fields. Results are ordered by `created_at` descending (most recent first).
