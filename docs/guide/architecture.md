# Architecture

## System Overview

Omelette follows a pipeline architecture where data flows through sequential modules:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Omelette Pipeline                              │
├─────────────────────────────────────────────────────────────────────────┤
│  Keywords → Search → Dedup → Crawler → OCR → RAG → Writing              │
└─────────────────────────────────────────────────────────────────────────┘
         │         │       │        │       │     │        │
         ▼         ▼       ▼        ▼       ▼     ▼        ▼
    [FastAPI]  [Sources] [SQLite] [PDFs] [Paddle] [Chroma] [LLM]
```

Each module consumes output from the previous stage and produces input for the next. Projects organize literature; keywords drive search; search results are deduplicated, crawled, OCR'd, indexed, and queried for writing assistance.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | FastAPI, SQLAlchemy 2 (async), Pydantic v2 |
| Frontend | React 19, Vite 7, TypeScript, Tailwind CSS |
| Database | SQLite |
| Vector DB | ChromaDB |
| OCR | PaddleOCR |
| LLM | OpenAI-compatible (Aliyun Bailian / Volcengine) |
| Embeddings | BAAI/bge-m3 (sentence-transformers) |

## Directory Structure

```
omelette/
├── backend/              # FastAPI application
│   ├── app/
│   │   ├── api/v1/       # REST endpoints (keywords, search, dedup, crawler, ocr, rag, writing)
│   │   ├── models/       # SQLAlchemy models (Project, Paper, Keyword, Task, etc.)
│   │   ├── schemas/      # Pydantic request/response schemas
│   │   ├── services/     # Business logic (LLM, search, crawler, OCR, RAG, writing)
│   │   └── main.py       # App entry, lifespan, CORS
│   └── tests/
├── frontend/             # React SPA
│   └── src/
│       ├── pages/        # Dashboard, ProjectDetail, Settings
│       ├── components/   # Layout, shared UI
│       ├── stores/       # Zustand state
│       └── lib/          # API client, utils
├── docs/                 # VitePress documentation
├── environment.yml      # Conda environment
├── .env.example         # Configuration template
└── .github/workflows/   # CI and docs deploy
```
