# Subscription API

Subscription module API for managing incremental literature updates (RSS / API search).

**Base path:** `/api/v1/projects/{project_id}/subscriptions`

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/feeds` | Get common academic RSS feed templates |
| GET | `/` | List project subscriptions |
| POST | `/` | Create subscription |
| GET | `/{sub_id}` | Get single subscription |
| PUT | `/{sub_id}` | Update subscription |
| DELETE | `/{sub_id}` | Delete subscription |
| POST | `/{sub_id}/trigger` | Manually trigger subscription update |
| POST | `/check-rss` | Check RSS feed |
| POST | `/check-updates` | Check API for updates |

---

## GET /feeds

Return common academic RSS feed templates (no project_id required in logic).

**Response**

```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "name": "arXiv CS",
      "url": "https://...",
      "description": "..."
    }
  ]
}
```

---

## GET /subscriptions

List all subscriptions for the project.

**Response**

```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "id": 1,
      "project_id": 1,
      "name": "arXiv CS.AI",
      "query": "machine learning",
      "sources": ["arxiv"],
      "frequency": "weekly",
      "max_results": 50,
      "is_active": true,
      "last_run_at": "2025-03-10T12:00:00",
      "total_found": 120,
      "created_at": "2025-01-01T00:00:00",
      "updated_at": "2025-03-10T12:00:00"
    }
  ]
}
```

---

## POST /subscriptions

Create a new subscription.

**Request Body**

```json
{
  "name": "arXiv CS.AI",
  "query": "machine learning",
  "sources": ["arxiv", "semantic_scholar"],
  "frequency": "weekly",
  "max_results": 50
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Subscription name |
| `query` | string | No | Search query, default `""` |
| `sources` | list[string] | No | Data sources, default `[]` |
| `frequency` | string | No | `daily` \| `weekly` \| `monthly`, default `weekly` |
| `max_results` | int | No | Max results per run 1–200, default 50 |

**Response**

```json
{
  "code": 201,
  "message": "Subscription created",
  "data": {
    "id": 1,
    "project_id": 1,
    "name": "arXiv CS.AI",
    "query": "machine learning",
    "sources": ["arxiv"],
    "frequency": "weekly",
    "max_results": 50,
    "is_active": true,
    "last_run_at": null,
    "total_found": 0,
    "created_at": "2025-03-12T00:00:00",
    "updated_at": "2025-03-12T00:00:00"
  }
}
```

---

## PUT /subscriptions/{sub_id}

Update a subscription.

**Request Body**

```json
{
  "name": "arXiv CS.AI (updated)",
  "query": "deep learning",
  "is_active": false
}
```

All fields optional; only include fields to update.

**Response**

```json
{
  "code": 200,
  "message": "success",
  "data": { ... }
}
```

---

## DELETE /subscriptions/{sub_id}

Delete a subscription.

**Response**

```json
{
  "code": 200,
  "message": "Subscription deleted",
  "data": null
}
```

---

## POST /subscriptions/{sub_id}/trigger

Manually trigger subscription update (check API for new papers).

**Query Parameters**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `since_days` | int | 7 | Query last N days, 1–365 |

**Response**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "new_papers": 5,
    "total_checked": 120,
    "sources_searched": ["arxiv", "semantic_scholar"]
  }
}
```

---

## POST /check-rss

Check an RSS feed (does not require a saved subscription).

**Query Parameters**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `feed_url` | string | — | RSS/Atom feed URL |
| `since_days` | int | 7 | Query last N days, 1–365 |

**Response**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "entries": [...],
    "count": 10
  }
}
```

---

## POST /check-updates

Check for new papers via API search (does not require a saved subscription).

**Query Parameters**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `query` | string | `""` | Search query |
| `sources` | list[string] | null | Data sources |
| `since_days` | int | 7 | Query last N days, 1–365 |
| `max_results` | int | 50 | Max results 1–200 |

**Response**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "new_papers": [...],
    "total_found": 50,
    "sources_checked": { "arxiv": 30, "semantic_scholar": 20 }
  }
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| 404 | Subscription not found |
