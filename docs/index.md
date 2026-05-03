---
layout: home
hero:
  name: "Omelette"
  text: "AI-Powered Literature Management"
  tagline: "Search · Deduplicate · OCR · Index · Chat — the complete research pipeline"
  image:
    src: /logo-mascot.png
    alt: Omelette Mascot
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/sylvanding/omelette

features:
  - icon: 🔍
    title: Multi-Source Search
    details: Federated search across Semantic Scholar, OpenAlex, arXiv, and Crossref with automatic deduplication.
    link: /modules/search
  - icon: 📄
    title: PDF Pipeline
    details: Automated PDF download, OCR processing, and full-text indexing with MinerU and PaddleOCR.
    link: /modules/ocr
  - icon: 🧠
    title: RAG Knowledge Base
    details: LlamaIndex-powered retrieval with GPU-aware embeddings, hybrid search, and cited answers.
    link: /modules/rag
  - icon: 💬
    title: Chat Playground
    details: ChatGPT-style conversational interface for literature Q&A with streaming responses.
    link: /guide/chat
  - icon: 📊
    title: Research Analytics
    details: Trend analysis, author networks, gap analysis, and paper comparison tools.
    link: /guide/features
  - icon: 🌐
    title: Bilingual & PWA
    details: Full Chinese/English i18n, installable PWA with offline support, responsive design.
    link: /guide/configuration
---

## Architecture

Omelette follows a modular pipeline architecture:

```
Keywords → Search → Dedup → Crawler → OCR → RAG → Writing
    │         │        │        │       │      │       │
    └─────────┴────────┴────────┴───────┴──────┴───────┘
                        LangGraph Orchestration
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 · TypeScript · Vite · TailwindCSS v4 · shadcn/ui |
| Backend | FastAPI · SQLAlchemy 2 (async) · Pydantic v2 · Python 3.12 |
| Database | SQLite + aiosqlite · Alembic |
| Vector Store | ChromaDB |
| RAG | LlamaIndex · BAAI/bge-m3 · bge-reranker-v2-m3 |
| LLM | LangChain (OpenAI · Anthropic · Aliyun · Volcengine · Ollama) |
| OCR | MinerU · pdfplumber · PaddleOCR |
| Pipeline | LangGraph with HITL interrupt/resume |

## Testing

| Suite | Framework | Count |
|-------|-----------|-------|
| Backend | pytest-asyncio | 861 tests |
| Frontend | Vitest + Testing Library | 273 tests |
| E2E | Playwright | 39 tests |
| CI | GitHub Actions | All passing ✅ |

## Quick Links

- [Getting Started](/guide/getting-started)
- [Architecture](/guide/architecture)
- [API Reference](/api/)
- [Configuration](/guide/configuration)
- [Pipeline Guide](/guide/pipeline)
- [MCP Integration](/guide/mcp)
- [Deployment](/guide/deployment)
