# Projects API

Base path: `/api/v1/projects`

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/projects` | List projects (paginated) |
| POST | `/projects` | Create project |
| GET | `/projects/{id}` | Get project |
| PUT | `/projects/{id}` | Update project |
| DELETE | `/projects/{id}` | Delete project |

## Query Parameters (List)

- `page` — Page number (default: 1)
- `page_size` — Items per page (default: 20)

## Request Body (Create/Update)

```json
{
  "name": "My Research",
  "description": "Optional description",
  "domain": "Optional domain",
  "settings": {}
}
```

## Response

Project includes `paper_count` and `keyword_count` when fetched individually or listed.
