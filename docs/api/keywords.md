# Keywords API

Base path: `/api/v1/projects/{project_id}/keywords`

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/projects/{id}/keywords` | List keywords |
| POST | `/projects/{id}/keywords` | Create keyword |
| POST | `/projects/{id}/keywords/bulk` | Bulk create |
| PUT | `/projects/{id}/keywords/{kw_id}` | Update keyword |
| DELETE | `/projects/{id}/keywords/{kw_id}` | Delete keyword |
| POST | `/projects/{id}/keywords/expand` | LLM expand |
| GET | `/projects/{id}/keywords/search-formula` | Generate formula |

## Query Parameters (List)

- `level` — Filter by level (1, 2, or 3)

## Keyword Schema

```json
{
  "term": "关键词",
  "term_en": "keyword",
  "level": 1,
  "parent_id": null,
  "synonyms": [],
  "category": ""
}
```

## Expand Request

```json
{
  "seed_terms": ["transformer", "attention"],
  "max_results": 10,
  "language": "en"
}
```

## Search Formula

Query param: `database` — `wos`, `scopus`, or `pubmed`
