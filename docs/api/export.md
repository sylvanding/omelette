# Export API

Base path: `/api/v1/projects/{project_id}/export`

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/projects/{id}/export/bibtex` | Export bibliography as BibTeX file |
| POST | `/projects/{id}/export/ris` | Export bibliography as RIS file |
| POST | `/projects/{id}/export/zotero` | Export papers to Zotero collection |

## BibTeX Export

`POST /projects/{id}/export/bibtex` — Generate and download a BibTeX file for selected papers.

**Request body:**
```json
{
  "paper_ids": [1, 2, 3]
}
```

**Response:** Returns a `.bib` file with `application/x-bibtex` content type.

## RIS Export

`POST /projects/{id}/export/ris` — Generate and download an RIS file for selected papers.

**Request body:**
```json
{
  "paper_ids": [1, 2, 3]
}
```

**Response:** Returns an `.ris` file with `application/x-research-info-systems` content type.

## Zotero Export

`POST /projects/{id}/export/zotero` — Create a Zotero collection with items via the Zotero REST API.

**Request body:**
```json
{
  "paper_ids": [1, 2, 3],
  "collection_name": "Omelette Export"
}
```

Requires `ZOTERO_API_KEY` and `ZOTERO_USER_ID` environment variables to be configured. Falls back to BibTeX preview when not configured.
