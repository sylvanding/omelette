# Keywords Module

Three-level keyword hierarchy with LLM-powered expansion and search formula generation for WOS, Scopus, PubMed.

## Features

- **Level 1 (core):** Primary research terms
- **Level 2 (sub-domain):** Field-specific terms
- **Level 3 (expanded):** Synonyms, abbreviations, related terms
- **LLM expansion:** Generate related terms from seed keywords
- **Search formula:** Boolean formulas for WOS, Scopus, PubMed

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/projects/{id}/keywords` | List keywords (optional `level` filter) |
| POST | `/projects/{id}/keywords` | Create keyword |
| POST | `/projects/{id}/keywords/bulk` | Bulk create |
| PUT | `/projects/{id}/keywords/{kw_id}` | Update keyword |
| DELETE | `/projects/{id}/keywords/{kw_id}` | Delete keyword |
| POST | `/projects/{id}/keywords/expand` | LLM expand seed terms |
| GET | `/projects/{id}/keywords/search-formula` | Generate search formula |

## Usage Example

```bash
# Create a keyword
curl -X POST http://localhost:8000/api/v1/projects/1/keywords \
  -H "Content-Type: application/json" \
  -d '{"term": "machine learning", "term_en": "machine learning", "level": 1}'

# Expand keywords with LLM
curl -X POST http://localhost:8000/api/v1/projects/1/keywords/expand \
  -H "Content-Type: application/json" \
  -d '{"seed_terms": ["transformer", "attention"], "max_results": 10, "language": "en"}'

# Get WOS search formula
curl "http://localhost:8000/api/v1/projects/1/keywords/search-formula?database=wos"
```
