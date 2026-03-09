# Literature Search Module

Federated search across Semantic Scholar, OpenAlex, arXiv, and Crossref with standardized metadata.

## Features

- **Multi-source:** Semantic Scholar, OpenAlex, arXiv, Crossref
- **Unified schema:** title, abstract, authors, DOI, year, source, citation_count
- **Auto-import:** Optionally import results into project papers
- **Keyword-driven:** Build query from project keywords when no query provided

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/projects/{id}/search/execute` | Execute search |
| GET | `/projects/{id}/search/sources` | List available sources |

## Search Parameters

- `query` — Search string (or built from level-1 keywords if empty)
- `sources` — Optional list: `semantic_scholar`, `openalex`, `arxiv`, `crossref`
- `max_results` — Max papers per source (default: 100)
- `auto_import` — If true, import results into project

## Usage Example

```bash
# Search with explicit query
curl -X POST "http://localhost:8000/api/v1/projects/1/search/execute" \
  -H "Content-Type: application/json" \
  -d '{"query": "transformer attention", "max_results": 50, "auto_import": true}'

# Search using project keywords (no query)
curl -X POST "http://localhost:8000/api/v1/projects/1/search/execute?auto_import=true"

# List sources
curl http://localhost:8000/api/v1/projects/1/search/sources
```
