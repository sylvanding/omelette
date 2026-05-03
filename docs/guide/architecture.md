# Architecture

## System Overview

Omelette follows a modular pipeline architecture with a React frontend and FastAPI backend.

```
┌──────────────────────────────────────────────┐
│              Frontend (React 18)              │
│   TypeScript · Vite · TailwindCSS · shadcn/ui │
│         TanStack Query · Zustand              │
├──────────────────────────────────────────────┤
│             Backend (FastAPI)                 │
│  Python 3.12 · SQLAlchemy 2 · Pydantic v2    │
├─────────┬────────┬────────┬────────┬─────────┤
│ Search  │ Dedup  │Crawler │  OCR   │   RAG   │
│LangChain│Semantic│Unpaywal│ MinerU │LlamaIndx│
│ OpenAlex│Scholar │ arXiv  │Paddle  │ChromaDB │
├─────────┴────────┴────────┴────────┴─────────┤
│           Storage: SQLite + ChromaDB           │
└──────────────────────────────────────────────┘
```

## Pipeline Flow

```
Keywords → Search → Dedup → Crawler → OCR → RAG → Writing
    │                                                    │
    └──────────── LangGraph Orchestration ────────────────┘
```

### 1. Keywords
Three-level hierarchy. LLM-powered expansion generates related terms. Search formulas auto-generated for WOS, Scopus, PubMed.

### 2. Multi-Source Search
Federated queries to Semantic Scholar, OpenAlex, arXiv, and Crossref. Results standardized to a common schema with deduplication.

### 3. Deduplication
Three-stage pipeline: DOI exact match → title fingerprint similarity → LLM verification. HITL conflict resolution via LangGraph interrupt.

### 4. Crawler
Multi-channel PDF download: Unpaywall → arXiv → direct URL. Tracks download status per paper.

### 5. OCR Processing
MinerU (auto-managed subprocess) for born-digital PDFs. PaddleOCR fallback for scanned documents. pdfplumber for native text extraction.

### 6. RAG Indexing
LlamaIndex with `BAAI/bge-m3` embeddings and `BAAI/bge-reranker-v2-m3` reranking. Hybrid retrieval combining vector search with keyword matching.

### 7. Writing & Chat
ChatGPT-style interface with knowledge base selection, tool modes (QA, citation lookup, review outline, gap analysis), and streaming responses.

## Backend Patterns

### API Structure
- All endpoints under `/api/v1/`
- Consistent response format: `{ code, message, data }`
- Pagination: `{ items, total, page, page_size, total_pages }`
- `project_id` path parameter scopes all project resources

### Database
- SQLAlchemy 2 async with aiosqlite
- Alembic migrations for schema changes
- Eager loading with `selectinload()` for relationship queries
- Cascade deletes on project removal

### LLM Integration
- LangChain provider abstraction (OpenAI, Anthropic, Aliyun, Volcengine, Ollama)
- Mock provider for development without API keys
- GPU model TTL management for resource efficiency

## Frontend Patterns

### State Management
- TanStack Query for server state with 30s stale time
- Zustand for client-only state (sidebar, theme)
- React Router for URL-driven navigation

### Component Architecture
- `PageLayout` wraps all project pages with title/subtitle/actions
- `ErrorBoundary` + `Suspense` on lazy-loaded routes
- Custom hooks for reading timer, debounced save, reading goals

### Testing
- Vitest + Testing Library + MSW for frontend (273 tests)
- MSW handlers mock all API endpoints in test fixtures
- Playwright for E2E critical flows (39 tests)

## Key Design Decisions

1. **SQLite** chosen for single-user simplicity. No server setup needed.
2. **Custom overlays** (not Dialog component) for full-screen modals like Author Network and Bibliography Builder.
3. **LocalStorage** for reading goals and citation style preferences.
4. **Port 3000** for Vite dev server with `/api` proxy to backend on port 8000.
