# Omelette 🍳

**Scientific literature lifecycle management for researchers.**

Omelette automates the full pipeline: keyword management → multi-source literature search → deduplication → PDF crawling → OCR → RAG knowledge base → writing assistance.

**Author:** [Sylvan Ding](https://github.com/sylvanding)

---

## Features

| Module | Description |
|--------|-------------|
| **Keywords** | Manage and expand research keywords with LLM assistance |
| **Search** | Multi-source literature search (Semantic Scholar, arXiv, OpenAlex, Crossref) |
| **Dedup** | Three-stage deduplication: DOI → title similarity → LLM verification |
| **Crawler** | Download PDFs via Unpaywall, arXiv, and direct URLs |
| **OCR** | Extract text from PDFs (native + PaddleOCR for scanned documents) |
| **RAG** | Build and query a vector knowledge base (ChromaDB + LLM answers) |
| **Writing** | Summarization, citation generation, review outline, gap analysis |
| **Projects** | Organize literature by research project |

---

## Quick Start

### Prerequisites

- [Conda](https://docs.conda.io/) or Miniconda
- Node.js 22+
- (Optional) CUDA for GPU-accelerated OCR and embeddings
- (Optional) API keys: Aliyun Bailian or Volcengine for LLM; Semantic Scholar for higher rate limits

### 1. Clone and setup environment

```bash
git clone git@github.com:sylvanding/omelette.git
cd omelette

# Create conda env and install all backend dependencies
conda env create -f environment.yml
conda activate omelette
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env with your API keys and data paths
```

### 3. Start backend

```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

> **Troubleshooting:** If you get `ModuleNotFoundError: No module named 'fastapi'`, make sure the conda environment is activated: `conda activate omelette`. You can verify with `which uvicorn` — it should point to the conda env, not `~/.local/bin/`.

### 4. Start frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 5. (Optional) OCR and Embeddings

For full OCR and embedding support:

```bash
cd backend
pip install -e ".[ocr,ml]"
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       Omelette Pipeline                         │
├─────────────────────────────────────────────────────────────────┤
│  Keywords → Search → Dedup → Crawler → OCR → RAG → Writing     │
└─────────────────────────────────────────────────────────────────┘
       │         │       │        │       │      │        │
       ▼         ▼       ▼        ▼       ▼      ▼        ▼
   [FastAPI] [Sources] [SQLite] [PDFs] [Paddle] [Chroma] [LLM]
```

- **Backend:** FastAPI + async SQLAlchemy + Pydantic v2
- **Frontend:** React 18 + TypeScript + Vite + TailwindCSS v4
- **Storage:** SQLite (metadata), ChromaDB (vectors), filesystem (PDFs)
- **LLM:** OpenAI-compatible API (Aliyun Bailian, Volcengine Doubao)

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | FastAPI, SQLAlchemy 2 (async), Pydantic v2 |
| Frontend | React 18, Vite, TypeScript, TailwindCSS v4 |
| Database | SQLite + aiosqlite |
| Vector DB | ChromaDB |
| OCR | PaddleOCR (optional) |
| LLM | OpenAI-compatible (Aliyun Bailian / Volcengine) |
| Embeddings | BAAI/bge-m3 via sentence-transformers (optional) |

---

## Project Layout

```
omelette/
├── backend/              # FastAPI application
│   ├── app/
│   │   ├── api/v1/       # REST endpoints
│   │   ├── models/       # SQLAlchemy ORM models
│   │   ├── schemas/      # Pydantic request/response schemas
│   │   ├── services/     # Business logic (LLM, search, crawler, OCR, RAG, writing)
│   │   ├── config.py     # Settings from .env
│   │   ├── database.py   # Async engine and session
│   │   └── main.py       # App entry, lifespan, CORS
│   ├── tests/            # pytest-asyncio tests (120+)
│   └── pyproject.toml    # Python dependencies (single source of truth)
├── frontend/             # React SPA
│   └── src/
│       ├── pages/        # Dashboard, ProjectDetail, module pages
│       ├── components/   # Layout, shared UI
│       ├── services/     # Typed API client
│       ├── stores/       # Zustand state
│       └── lib/          # Axios client, utils
├── docs/                 # VitePress documentation (EN/ZH)
├── environment.yml       # Conda environment (Python 3.12 + pip install)
├── Makefile              # Dev workflow shortcuts
├── .env.example          # Configuration template
├── .pre-commit-config.yaml  # Code quality hooks
└── .github/workflows/    # CI (ruff, pytest, tsc, build, docs deploy)
```

---

## Development

```bash
# Install pre-commit hooks
make pre-commit-install

# Run linters
make lint

# Auto-format code
make format

# Run all tests
make test

# Start both backend and frontend
make dev
```

---

## Running Tests

```bash
# Backend (120+ tests)
cd backend && pytest tests/ -v

# Frontend type check and build
cd frontend && npx tsc --noEmit && npm run build
```

---

## Configuration

Key environment variables (see `.env.example`):

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | SQLite path (default: `sqlite:///./data/omelette.db`) |
| `DATA_DIR` | Base path for PDFs, OCR output, ChromaDB |
| `LLM_PROVIDER` | `aliyun`, `volcengine`, or `mock` |
| `ALIYUN_API_KEY` | Aliyun Bailian API key |
| `VOLCENGINE_API_KEY` | Volcengine Doubao API key |
| `SEMANTIC_SCHOLAR_API_KEY` | Optional; increases Semantic Scholar rate limit |

## API Overview

REST APIs under `/api/v1/`:

- `GET/POST /projects` — Project CRUD
- `GET/POST /projects/{id}/papers` — Paper management
- `GET/POST /projects/{id}/keywords` — Keyword management
- `GET /projects/{id}/keywords/search-formula` — Generate search formula
- `POST /projects/{id}/search` — Execute multi-source search
- `POST /projects/{id}/dedup/run` — Run deduplication
- `POST /projects/{id}/crawl/start` — Start PDF download
- `POST /projects/{id}/ocr/process` — Run OCR on papers
- `POST /projects/{id}/rag/index` — Build vector index
- `POST /projects/{id}/rag/query` — RAG retrieval
- `POST /projects/{id}/writing/assist` — Writing assistance
- `GET /settings/health` — Health check

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT License — see [LICENSE](LICENSE).

## Name Origin

**Om** (Omni-) + **Lit** (Literature) = **Omlit** ≈ **Omelette** 🍳
