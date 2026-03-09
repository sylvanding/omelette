# Omelette 🍳

**Scientific literature lifecycle management for researchers.**

Omelette automates the full pipeline: keyword management → multi-source literature search → deduplication → PDF crawling → OCR → RAG knowledge base → writing assistance.

**Author:** [Sylvan Ding](https://github.com/sylvanding)

---

## Features

| Module | Description |
|--------|-------------|
| **Keywords** | Manage and expand research keywords with LLM assistance |
| **Search** | Multi-source literature search (Semantic Scholar, arXiv, RSS, etc.) |
| **Dedup** | Deduplicate papers across sources |
| **Crawler** | Crawl and download PDFs from open-access sources |
| **OCR** | Extract text from PDFs (PaddleOCR for scanned documents) |
| **RAG** | Build and query a vector knowledge base (ChromaDB + embeddings) |
| **Writing** | LLM-powered writing assistance, summarization, and citation generation |
| **Projects** | Organize literature by research project |

---

## Quick Start

### Prerequisites

- [Conda](https://docs.conda.io/) or Miniconda
- Node.js 22+
- (Optional) CUDA for GPU-accelerated OCR and embeddings
- (Optional) API keys: Aliyun Bailian or Volcengine for LLM; Semantic Scholar for higher search limits

### 1. Clone and setup environment

```bash
git clone git@github.com:sylvanding/omelette.git
cd omelette
conda env create -f environment.yml
conda activate omelette
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env with your API keys (LLM, Semantic Scholar, etc.)
```

### 3. Backend

```bash
cd backend
pip install -e ".[dev]"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Optional: OCR and Embeddings

For full OCR and embedding support, install optional dependencies:

```bash
conda activate omelette
cd backend
pip install -e ".[ocr,ml]"
```

- **OCR:** PaddleOCR (GPU recommended via `paddlepaddle-gpu`)
- **Embeddings:** sentence-transformers with BAAI/bge-m3 (downloads on first use)

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

- **Backend:** FastAPI with async SQLAlchemy, Pydantic v2, dependency injection
- **Frontend:** React + Vite + TanStack Query + Zustand
- **Storage:** SQLite (metadata), ChromaDB (vectors), filesystem (PDFs, OCR output)
- **LLM:** OpenAI-compatible API (Aliyun Bailian, Volcengine Doubao)

---

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

---

## Project Layout

```
omelette/
├── backend/              # FastAPI application
│   ├── app/
│   │   ├── api/v1/       # REST endpoints (keywords, search, dedup, crawler, ocr, rag, writing)
│   │   ├── models/       # SQLAlchemy models (Project, Paper, Keyword, Task, etc.)
│   │   ├── schemas/      # Pydantic request/response schemas
│   │   ├── services/     # LLM client, future: search, crawler, OCR services
│   │   └── main.py       # App entry, lifespan, CORS
│   └── tests/
├── frontend/             # React SPA
│   └── src/
│       ├── pages/        # Dashboard, ProjectDetail, Settings
│       ├── components/   # Layout, shared UI
│       ├── stores/       # Zustand state (projects, etc.)
│       └── lib/          # API client, utils
├── environment.yml       # Conda environment
├── .env.example          # Configuration template
└── .github/workflows/    # CI (ruff, mypy, pytest, tsc, build)
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style, and PR process.

---

## License

MIT License — see [LICENSE](LICENSE).

---

## Configuration

Key environment variables (see `.env.example`):

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | SQLite path (default: `sqlite:///./data/omelette.db`) |
| `LLM_PROVIDER` | `aliyun`, `volcengine`, or `mock` |
| `ALIYUN_API_KEY` | Aliyun Bailian API key |
| `VOLCENGINE_API_KEY` | Volcengine Doubao API key |
| `EMBEDDING_MODEL` | HuggingFace model (e.g. `BAAI/bge-m3`) |
| `DATA_DIR` | Base path for PDFs, OCR output, ChromaDB |
| `SEMANTIC_SCHOLAR_API_KEY` | Optional; increases rate limit |

## API Overview

The backend exposes REST APIs under `/api/v1/`:

- `GET/POST /projects` — Project CRUD
- `GET/POST /projects/{id}/keywords` — Keyword management
- `POST /projects/{id}/keywords/expand` — LLM keyword expansion
- `POST /projects/{id}/search` — Execute literature search
- `POST /projects/{id}/dedup` — Run deduplication
- `POST /projects/{id}/crawl` — Start PDF crawl
- `POST /projects/{id}/ocr` — Run OCR on papers
- `POST /projects/{id}/rag/build` — Build vector index
- `POST /projects/{id}/rag/query` — RAG retrieval
- `POST /projects/{id}/writing/assist` — Writing assistance
- `GET /tasks/{id}` — Poll async task status

## Running Tests

```bash
# Backend
cd backend && pytest tests/ -v

# Frontend
cd frontend && npx tsc --noEmit && npm run build
```

## Data Persistence

- **SQLite:** Database file path is set by `DATABASE_URL` (default: `./data/omelette.db`)
- **ChromaDB:** Vector store path is set by `CHROMA_DB_DIR` (default: `{DATA_DIR}/chroma_db`)
- **PDFs & OCR:** Stored under `PDF_DIR` and `OCR_OUTPUT_DIR` respectively

Ensure `DATA_DIR` exists and is writable before running crawls or OCR.

## Name Origin

**Om** (Omni-) + **Lit** (Literature) = **Omlit** ≈ **Omelette** 🍳
