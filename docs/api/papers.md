# Papers API

Base path: `/api/v1/projects/{project_id}/papers`

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/projects/{id}/papers` | List papers (paginated) |
| POST | `/projects/{id}/papers` | Create paper |
| POST | `/projects/{id}/papers/bulk` | Bulk import |
| POST | `/projects/{id}/papers/upload` | Multipart file upload (PDFs) |
| POST | `/projects/{id}/papers/process` | Trigger processing for papers |
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

## Upload (Multipart)

`POST /projects/{id}/papers/upload` — Upload PDF files. Accepts `multipart/form-data` with `files` (one or more PDFs). Extracts metadata, runs dedup check, and queues processing for new papers.

**Response:** `{ papers, conflicts, total_uploaded }`

- `papers` — List of newly created paper metadata
- `conflicts` — Dedup conflicts (DOI or title similarity)
- `total_uploaded` — Count of files successfully uploaded

## Process

`POST /projects/{id}/papers/process` — Trigger OCR + RAG indexing for papers.

**Query parameters:**

- `paper_ids` — Optional list of paper IDs. If omitted, all unprocessed papers in the project are queued.

**Response:** `{ queued, message }`

## Bulk Import Response

`POST /projects/{id}/papers/bulk` returns `{ created, skipped, total }`:

- `created` — Number of papers imported
- `skipped` — Number skipped (duplicate DOI)
- `total` — Total papers in request
