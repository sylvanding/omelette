# Collections API

Base path: `/api/v1/projects/{project_id}/collections`

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/projects/{id}/collections` | List collections in a project |
| POST | `/projects/{id}/collections` | Create a new collection |
| GET | `/projects/{id}/collections/{collection_id}` | Get collection with its papers |
| PUT | `/projects/{id}/collections/{collection_id}` | Update a collection |
| DELETE | `/projects/{id}/collections/{collection_id}` | Delete a collection |
| POST | `/projects/{id}/collections/{collection_id}/papers` | Add papers to a collection |
| DELETE | `/projects/{id}/collections/{collection_id}/papers` | Remove papers from a collection |
| POST | `/projects/{id}/collections/tags/suggest` | Get AI-suggested tags for papers |

## Collection Schema

```json
{
  "id": 1,
  "project_id": 1,
  "name": "Machine Learning",
  "description": "Papers about ML",
  "color": "#3B82F6",
  "sort_order": 0,
  "paper_count": 5
}
```

## Create Collection

`POST /projects/{id}/collections`

**Request body:**
```json
{
  "name": "Collection Name",
  "description": "Optional description",
  "color": "#FF5733"
}
```

## Add Papers

`POST /projects/{id}/collections/{collection_id}/papers`

**Request body:**
```json
{
  "paper_ids": [1, 2, 3]
}
```

Existing papers are not duplicated — only new associations are created.

## Remove Papers

`DELETE /projects/{id}/collections/{collection_id}/papers`

**Request body:**
```json
{
  "paper_ids": [1, 2]
}
```

## Smart Tags

`POST /projects/{id}/collections/tags/suggest` — Get AI-generated tag suggestions for papers.

**Request body:**
```json
{
  "paper_ids": [1, 2, 3]
}
```

**Response fields:**
- `tags[]` — Each with `paper_id`, `suggested_tags` (list of string tags)
