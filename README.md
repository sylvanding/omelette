<p align="center">
  <img src="assets/banner.png" alt="Omelette Banner" width="680" />
</p>

<p align="center">
  <strong>AI-Powered Scientific Literature Lifecycle Management</strong>
</p>

<p align="center">
  <a href="https://github.com/sylvanding/omelette/actions"><img src="https://img.shields.io/github/actions/workflow/status/sylvanding/omelette/ci.yml?branch=main&style=flat-square&logo=githubactions&logoColor=white&label=CI" alt="CI"></a>
  <a href="https://github.com/sylvanding/omelette/blob/main/LICENSE"><img src="https://img.shields.io/github/license/sylvanding/omelette?style=flat-square&color=blue" alt="License"></a>
  <a href="https://www.python.org/"><img src="https://img.shields.io/badge/python-3.12-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python 3.12"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-22+-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js 22+"></a>
  <a href="https://fastapi.tiangolo.com/"><img src="https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI"></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React_18-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 18"></a>
  <a href="https://sylvanding.github.io/omelette/"><img src="https://img.shields.io/badge/docs-VitePress-646CFF?style=flat-square&logo=vitepress&logoColor=white" alt="Docs"></a>
</p>

<p align="center">
  <a href="README_zh.md">中文</a> ·
  <a href="https://sylvanding.github.io/omelette/">Documentation</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="https://github.com/sylvanding/omelette/issues">Report Bug</a>
</p>

---

Omelette is a full-stack application for managing the complete scientific literature lifecycle. Search across academic databases, deduplicate results, download and OCR papers, build RAG-powered knowledge bases, and interact with your literature through a ChatGPT-style conversational interface.

> **Om** (Omni-) + **Lit** (Literature) = **Omlit** ≈ **Omelette** 🍳

## Features

### Literature Pipeline
- **Keyword Management** — Three-level hierarchy with LLM-powered term expansion and search formula generation for WOS, Scopus, PubMed
- **Multi-Source Search** — Federated search across Semantic Scholar, OpenAlex, arXiv, and Crossref
- **Smart Deduplication** — Three-stage pipeline: DOI exact match → title similarity → LLM verification
- **PDF Crawler** — Multi-channel download via Unpaywall, arXiv, and direct URL fallback
- **OCR Processing** — MinerU (auto-managed) + pdfplumber + PaddleOCR for scanned PDFs
- **Incremental Subscription** — RSS and API-based scheduled updates

### AI & Knowledge Management
- **RAG Knowledge Base** — LlamaIndex + ChromaDB with GPU-aware embeddings, hybrid retrieval, and cited answers
- **Chat Playground** — ChatGPT-style conversational interface for literature Q&A
- **Multi-Provider LLM** — LangChain integration for OpenAI, Anthropic, Aliyun, Volcengine, and Ollama
- **LangGraph Pipeline** — StateGraph-based orchestration with HITL interrupt/resume

### Research Tools
- **Audio Overviews** — LLM-generated dialogue audio for paper collections
- **Citation Tools** — APA, MLA, Chicago, IEEE, GB/T 7714 styles with bibliography builder
- **Author Network** — d3-force directed graph of co-authorship relationships
- **Trend Analysis** — Year-binned topic trends with emerging/declining detection
- **Gap Analysis** — LLM-powered research gap identification with novelty scoring
- **Version Tracking** — Paper version history with Semantic Scholar polling
- **Paper Comparison** — Side-by-side comparison with diff highlighting

### Collaboration
- **Team Members** — Project team management with RBAC (read/write/admin)
- **API Keys** — SHA-256 hashed keys with scope-based access control
- **Collection Management** — Custom paper collections with AI-suggested tags
- **MCP Integration** — Model Context Protocol server for AI IDE clients

### User Experience
- **i18n** — Full Chinese/English bilingual support
- **PWA** — Installable with offline caching
- **Responsive** — Mobile-optimized with horizontal scroll navigation
- **Dark Mode** — System-aware theme

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Frontend (React 18)                 │
│  TypeScript · Vite · TailwindCSS · shadcn/ui · TanStack │
├─────────────────────────────────────────────────────────┤
│                    Backend (FastAPI)                     │
│  Python 3.12 · SQLAlchemy 2 (async) · Pydantic v2       │
├──────────┬──────────┬──────────┬──────────┬────────────┤
│  Search  │  Dedup   │  Crawler │   OCR    │    RAG     │
│ LangChain│ Semantic │ Unpaywall│  MinerU  │ LlamaIndex │
│  OpenAlex│ Scholar  │  arXiv   │PaddleOCR │  ChromaDB  │
├──────────┴──────────┴──────────┴──────────┴────────────┤
│                   Storage: SQLite + ChromaDB             │
└─────────────────────────────────────────────────────────┘
```

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, TypeScript, Vite, TailwindCSS v4, shadcn/ui, TanStack Query |
| **Backend** | FastAPI, SQLAlchemy 2 (async), Pydantic v2, Python 3.12 |
| **Database** | SQLite + aiosqlite, Alembic migrations |
| **Vector Store** | ChromaDB |
| **RAG** | LlamaIndex with GPU-aware BAAI/bge-m3 embeddings |
| **LLM** | LangChain (OpenAI, Anthropic, Aliyun Bailian, Volcengine, Ollama) |
| **Orchestration** | LangGraph with HITL interrupt/resume |
| **OCR** | MinerU (auto-managed) + pdfplumber (native) + PaddleOCR (scanned) |
| **Docs** | VitePress (bilingual EN/ZH) |

## Quick Start

### Prerequisites
- [Conda](https://docs.conda.io/) or Miniconda
- Node.js 22+
- (Optional) CUDA for GPU-accelerated OCR and embeddings

### Setup

```bash
git clone git@github.com:sylvanding/omelette.git
cd omelette

# Backend
conda env create -f environment.yml
conda activate omelette
cp .env.example .env  # Edit with your API keys
cd backend && alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Frontend (new terminal)
cd frontend && npm install
npm run dev -- --port 3000
```

Open [http://localhost:3000](http://localhost:3000).

### Key Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | SQLite path (default: `sqlite:///./data/omelette.db`) |
| `DATA_DIR` | Base path for PDFs, OCR output, ChromaDB |
| `LLM_PROVIDER` | `openai`, `anthropic`, `aliyun`, `volcengine`, `ollama`, or `mock` |
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `PDF_PARSER` | `auto`, `mineru`, or `pdfplumber` |
| `GPU_MODE` | `conservative`, `balanced` (default), `aggressive` |

See [`.env.example`](.env.example) for the full list.

## Development

```bash
# Frontend
cd frontend
npm test                 # 273 tests (Vitest + Testing Library)
npx tsc --noEmit         # TypeScript check
npx eslint src/          # Lint

# Backend
cd backend
pytest tests/ -v         # 861 tests (pytest-asyncio)
ruff check app/          # Lint

# E2E
npx playwright test      # 39 tests (requires frontend dev server)
```

## API Overview

Base URL: `/api/v1`

| Endpoint | Description |
|----------|-------------|
| `GET/POST /projects` | Project CRUD |
| `GET/POST /projects/{id}/papers` | Paper management with search, filter, sort |
| `GET/POST /projects/{id}/keywords` | Keyword hierarchy |
| `POST /projects/{id}/search/execute` | Federated academic search |
| `POST /projects/{id}/dedup/run` | Run deduplication |
| `POST /projects/{id}/crawl/start` | Start PDF download |
| `POST /projects/{id}/ocr/process` | Run OCR on papers |
| `POST /projects/{id}/rag/index` | Build vector index |
| `POST /projects/{id}/rag/query` | RAG retrieval |
| `POST /chat` | Chat messages (playground) |
| `GET/POST /projects/{id}/collections` | Paper collections |
| `GET/POST /subscriptions` | Subscription management |
| `GET /projects/{id}/analytics` | Reading analytics |
| `POST /projects/{id}/concepts/extract` | Concept extraction |
| `POST /projects/{id}/analysis/contradictions` | Contradiction detection |

Full documentation: [API Reference](https://sylvanding.github.io/omelette/api/)

## Project Structure

```
omelette/
├── backend/               # FastAPI application
│   ├── app/
│   │   ├── api/v1/        # REST endpoints (33 modules)
│   │   ├── models/        # SQLAlchemy ORM models
│   │   ├── schemas/       # Pydantic request/response schemas
│   │   ├── services/      # Business logic + LLM services
│   │   └── pipelines/     # LangGraph pipeline definitions
│   ├── alembic/           # Database migrations
│   ├── mcp_server.py      # MCP (Model Context Protocol) server
│   └── tests/             # pytest-asyncio tests (861 tests)
├── frontend/              # React SPA
│   └── src/
│       ├── pages/         # Route components (35 project pages)
│       ├── components/    # Reusable UI + layout
│       ├── services/      # Typed API client
│       ├── hooks/         # Custom hooks
│       ├── i18n/          # zh/en translations
│       └── test/          # Vitest setup, MSW mocks
├── e2e/                   # Playwright E2E tests (39 tests)
├── docs/                  # VitePress documentation (EN/ZH)
├── scripts/ralph/         # Ralph autonomous agent workflow
└── .github/workflows/     # CI (ruff, pytest, vitest, tsc)
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT License](LICENSE) — Copyright © 2026 [Sylvan Ding](https://github.com/sylvanding)
