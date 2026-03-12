# Dedup API

Deduplication module API: DOI exact dedup, title similarity dedup, and LLM-assisted verification.

**Base path:** `/api/v1/projects/{project_id}/dedup`

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/run` | Run deduplication pipeline |
| GET | `/candidates` | List candidate duplicate pairs for manual review |
| POST | `/verify` | LLM-verify if two papers are duplicates |
| POST | `/resolve` | Resolve single upload conflict (keep_old / keep_new / merge / skip) |
| POST | `/auto-resolve` | AI auto-suggest conflict resolution |

---

## POST /run

Run the deduplication pipeline.

**Query Parameters**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `strategy` | string | `"full"` | Strategy: `doi_only` \| `title_only` \| `full` |

**Response**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "stage1_doi_removed": 0,
    "stage2_title_removed": 0,
    "stage3_candidates": 5,
    "total_remaining": 120,
    "details": {
      "doi_duplicates": [],
      "title_duplicates": [],
      "llm_candidates": []
    }
  }
}
```

- `strategy=doi_only`: DOI exact dedup only
- `strategy=title_only`: Title similarity dedup only
- `strategy=full`: Full 3-stage (DOI → title → LLM candidates)

**Example**

```bash
curl -X POST "http://localhost:8000/api/v1/projects/1/dedup/run?strategy=full"
```

---

## GET /candidates

List candidate duplicate pairs for manual review (high title similarity, need LLM or human confirmation).

**Response**

```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "paper_a_id": 10,
      "paper_b_id": 11,
      "similarity": 0.92,
      "paper_a": { "id": 10, "title": "...", "doi": "..." },
      "paper_b": { "id": 11, "title": "...", "doi": "..." }
    }
  ]
}
```

**Example**

```bash
curl "http://localhost:8000/api/v1/projects/1/dedup/candidates"
```

---

## POST /verify

Use LLM to determine if two papers are duplicates.

**Query Parameters**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `paper_a_id` | int | Yes | Paper A ID |
| `paper_b_id` | int | Yes | Paper B ID |

**Response**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "is_duplicate": true,
    "reason": "Same paper, different sources"
  }
}
```

**Example**

```bash
curl -X POST "http://localhost:8000/api/v1/projects/1/dedup/verify?paper_a_id=10&paper_b_id=11"
```

---

## POST /resolve

Resolve a single upload conflict. `conflict_id` format: `{old_paper_id}:{saved_filename}`, provided by the upload endpoint's `conflicts` array.

**Request Body**

```json
{
  "conflict_id": "123:uploaded.pdf",
  "action": "keep_old",
  "merged_paper": null
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `conflict_id` | string | Yes | Conflict ID, format `old_paper_id:saved_filename` |
| `action` | string | Yes | `keep_old` \| `keep_new` \| `merge` \| `skip` |
| `merged_paper` | object | No | Required when `action=merge`, merged metadata |

**Actions**

- `keep_old`: Keep existing paper, discard upload
- `keep_new`: Use new upload, create new paper
- `merge`: Merge metadata, create new paper (provide `merged_paper`)
- `skip`: Use new upload, create new paper (same as keep_new)

**Response**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "action": "keep_new",
    "paper_id": 124,
    "message": "Created new paper"
  }
}
```

**Example**

```bash
curl -X POST "http://localhost:8000/api/v1/projects/1/dedup/resolve" \
  -H "Content-Type: application/json" \
  -d '{"conflict_id":"123:paper.pdf","action":"keep_new"}'
```

---

## POST /auto-resolve

Use LLM to batch-suggest conflict resolution.

**Request Body**

```json
{
  "conflict_ids": ["123:file1.pdf", "124:file2.pdf"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `conflict_ids` | list[string] | No | Conflict ID list; empty returns empty list |

**Response**

```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "conflict_id": "123:file1.pdf",
      "action": "keep_new",
      "reason": "New version has more complete metadata"
    },
    {
      "conflict_id": "124:file2.pdf",
      "error": "Paper not found"
    }
  ]
}
```

Each element is either `{conflict_id, action, reason}` or `{conflict_id, error}`.

**Example**

```bash
curl -X POST "http://localhost:8000/api/v1/projects/1/dedup/auto-resolve" \
  -H "Content-Type: application/json" \
  -d '{"conflict_ids":["123:paper.pdf"]}'
```

---

## Error Codes

| Code | Description |
|------|-------------|
| 400 | Invalid `conflict_id` format, `action`, or request body |
| 404 | Paper not found or PDF file not found |
