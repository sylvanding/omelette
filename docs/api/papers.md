# Papers API

Base path: `/api/v1/projects/{project_id}/papers`

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/projects/{id}/papers` | List papers (paginated) |
| POST | `/projects/{id}/papers` | Create paper |
| POST | `/projects/{id}/papers/bulk` | Bulk import |
| GET | `/projects/{id}/papers/{paper_id}` | Get paper |
| PUT | `/projects/{id}/papers/{paper_id}` | Update paper |
| DELETE | `/projects/{id}/papers/{paper_id}` | Delete paper |

## Query Parameters (List)

- `page`, `page_size` — Pagination
- `status` — Filter by status (e.g. `metadata_only`, `pdf_downloaded`)
- `year` — Filter by year
- `q` — Search title/abstract
- `sort_by` — `created_at`, `year`, `citation_count`, etc.
- `order` — `asc` or `desc`

## Paper Schema

```json
{
  "doi": "",
  "title": "",
  "abstract": "",
  "authors": [],
  "journal": "",
  "year": 2024,
  "citation_count": 0,
  "source": "",
  "source_id": "",
  "pdf_url": "",
  "status": "metadata_only"
}
```
