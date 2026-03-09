# Subscription Module

RSS feeds and API-based scheduled updates to track new publications.

## Features

- **RSS feeds:** Subscribe to arXiv categories, journal feeds
- **API check:** Scheduled Semantic Scholar/arXiv queries
- **Auto-pipeline:** New papers flow into dedup → crawl → OCR → index

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/projects/{id}/subscription/feeds` | List RSS feeds |
| POST | `/projects/{id}/subscription/check-rss` | Check RSS feeds now |
| POST | `/projects/{id}/subscription/check-updates` | Check API sources |

## Usage Example

```bash
# List feeds
curl http://localhost:8000/api/v1/projects/1/subscription/feeds

# Trigger RSS check
curl -X POST http://localhost:8000/api/v1/projects/1/subscription/check-rss

# Trigger API update check
curl -X POST http://localhost:8000/api/v1/projects/1/subscription/check-updates
```
