<p align="center">
  <img src="assets/banner.png" alt="Omelette Banner" width="680" />
</p>

<p align="center">
  <strong>A full-stack Scientific Literature Lifecycle Management System</strong>
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
  <a href="https://sylvanding.github.io/omelette/">Documentation</a> ·
  <a href="https://sylvanding.github.io/omelette/zh/">中文文档</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="https://github.com/sylvanding/omelette/issues">Report Bug</a>
</p>

---

Omelette automates the full research literature pipeline — from keyword management and multi-source search, through deduplication and PDF crawling, to OCR processing, RAG-powered knowledge base, and AI writing assistance.

> **Om** (Omni-) + **Lit** (Literature) = **Omlit** ≈ **Omelette** 🍳

## ✨ Features

<table>
<tr>
  <td width="50%">

  **🔑 Keyword Management**
  Three-level hierarchy with LLM-powered expansion and search formula generation for WOS, Scopus, PubMed.

  **🔍 Multi-Source Search**
  Federated search across Semantic Scholar, OpenAlex, arXiv, and Crossref with standardized metadata.

  **🧹 Smart Deduplication**
  Three-stage pipeline: DOI hard dedup → title similarity → LLM verification.

  **📡 Incremental Subscription**
  RSS feeds and API-based scheduled updates to track new publications automatically.

  </td>
  <td width="50%">

  **📥 PDF Crawler**
  Multi-channel download via Unpaywall, arXiv, and direct URL fallback strategies.

  **📝 OCR Processing**
  Native text extraction with PaddleOCR GPU fallback for scanned documents.

  **🧠 RAG Knowledge Base**
  ChromaDB vector indexing with hybrid retrieval and LLM-generated answers with citations.

  **✍️ Writing Assistant**
  Summarization, citation generation (GB/T 7714, APA, MLA), review outlines, and gap analysis.

  </td>
</tr>
</table>

## 🏗️ Architecture

```
Keywords ─→ Search ─→ Dedup ─→ Crawler ─→ OCR ─→ RAG ─→ Writing
   │          │         │         │        │       │        │
   ▼          ▼         ▼         ▼        ▼       ▼        ▼
 [LLM]    [Sources]  [SQLite]  [PDFs]  [Paddle] [Chroma]  [LLM]
```

| Layer | Technology |
|-------|------------|
| **Backend** | FastAPI, SQLAlchemy 2 (async), Pydantic v2, Python 3.12 |
| **Frontend** | React 18, Vite, TypeScript, TailwindCSS v4 |
| **Database** | SQLite + aiosqlite |
| **Vector Store** | ChromaDB |
| **OCR** | pdfplumber (native) + PaddleOCR (scanned, optional) |
| **LLM** | OpenAI-compatible API (Aliyun Bailian / Volcengine Doubao) |
| **Embeddings** | BAAI/bge-m3 via sentence-transformers (optional) |
| **Docs** | VitePress (bilingual EN/ZH) |

## 🚀 Quick Start

### Prerequisites

- [Conda](https://docs.conda.io/) or Miniconda
- Node.js 22+
- (Optional) CUDA for GPU-accelerated OCR and embeddings
- (Optional) API keys: Aliyun Bailian or Volcengine for LLM; Semantic Scholar for higher rate limits

### 1. Clone & setup

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

<details>
<summary><strong>Key environment variables</strong></summary>

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | SQLite path (default: `sqlite:///./data/omelette.db`) |
| `DATA_DIR` | Base path for PDFs, OCR output, ChromaDB |
| `LLM_PROVIDER` | `aliyun`, `volcengine`, or `mock` |
| `ALIYUN_API_KEY` | Aliyun Bailian API key |
| `VOLCENGINE_API_KEY` | Volcengine Doubao API key |
| `SEMANTIC_SCHOLAR_API_KEY` | Optional; increases Semantic Scholar rate limit |

See [`.env.example`](.env.example) for the full list.

</details>

### 3. Start backend

```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 4. Start frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. (Optional) OCR & Embeddings

```bash
cd backend
pip install -e ".[ocr,ml]"
```

> **Troubleshooting:** If you get `ModuleNotFoundError: No module named 'fastapi'`, ensure the conda environment is activated: `conda activate omelette`.

## 📂 Project Layout

```
omelette/
├── backend/              # FastAPI application
│   ├── app/
│   │   ├── api/v1/       # REST endpoints
│   │   ├── models/       # SQLAlchemy ORM models
│   │   ├── schemas/      # Pydantic request/response schemas
│   │   ├── services/     # Business logic
│   │   ├── config.py     # Settings from .env
│   │   ├── database.py   # Async engine and session
│   │   └── main.py       # App entry, lifespan, CORS
│   ├── tests/            # pytest-asyncio tests (120+)
│   └── pyproject.toml    # Python dependencies
├── frontend/             # React SPA
│   └── src/
│       ├── pages/        # Dashboard, ProjectDetail, modules
│       ├── components/   # Layout, shared UI
│       ├── services/     # Typed API client
│       ├── stores/       # Zustand state
│       └── lib/          # Axios client, utils
├── docs/                 # VitePress documentation (EN/ZH)
├── assets/               # Banner, logo, mascot images
├── environment.yml       # Conda env (Python 3.12)
├── Makefile              # Dev workflow shortcuts
├── .env.example          # Configuration template
└── .github/workflows/    # CI (ruff, pytest, tsc, build, docs)
```

## 🛠️ Development

```bash
make pre-commit-install   # Install pre-commit hooks
make lint                 # Run linters
make format               # Auto-format code
make test                 # Run all tests
make dev                  # Start both backend and frontend
```

### Running Tests

```bash
# Backend (120+ tests)
cd backend && pytest tests/ -v

# Frontend type check and build
cd frontend && npx tsc --noEmit && npm run build
```

## 📡 API Overview

REST APIs under `/api/v1/`:

| Endpoint | Description |
|----------|-------------|
| `GET/POST /projects` | Project CRUD |
| `GET/POST /projects/{id}/papers` | Paper management |
| `GET/POST /projects/{id}/keywords` | Keyword management |
| `GET /projects/{id}/keywords/search-formula` | Generate search formula |
| `POST /projects/{id}/search` | Execute multi-source search |
| `POST /projects/{id}/dedup/run` | Run deduplication |
| `POST /projects/{id}/crawl/start` | Start PDF download |
| `POST /projects/{id}/ocr/process` | Run OCR on papers |
| `POST /projects/{id}/rag/index` | Build vector index |
| `POST /projects/{id}/rag/query` | RAG retrieval |
| `POST /projects/{id}/writing/assist` | Writing assistance |
| `GET /settings/health` | Health check |

Full documentation: [API Reference](https://sylvanding.github.io/omelette/api/)

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📄 License

[MIT License](LICENSE) — Copyright © 2026 [Sylvan Ding](https://github.com/sylvanding)
