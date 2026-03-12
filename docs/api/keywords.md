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
| GET | `/projects/{id}/keywords/search-formula` | Generate search formula |

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

## Bulk Create

`POST /projects/{id}/keywords/bulk` — Create multiple keywords at once.

**Request body:** Array of `KeywordCreate` objects.

**Response:** `{ created }` — Number of keywords created.

## Expand Request

```json
{
  "seed_terms": ["transformer", "attention"],
  "max_results": 10,
  "language": "en"
}
```

## Expand Response

Returns `expanded_terms` as a list of objects:

```json
{
  "expanded_terms": [
    {"term": "self-attention", "term_zh": "自注意力", "relation": "synonym"},
    {"term": "BERT", "term_zh": "", "relation": "abbreviation"}
  ],
  "source": "llm:openai"
}
```

- `term` — Expanded term (English)
- `term_zh` — Chinese translation (optional)
- `relation` — `synonym`, `abbreviation`, or `related`

## Search Formula

`GET /projects/{id}/keywords/search-formula?database=wos` — Generate a boolean search formula from project keywords for a specific database.

**Query parameters:**

- `database` — Target database: `wos`, `scopus`, or `pubmed` (default: `wos`)

**Response:** `{ formula, database, keyword_count }`
