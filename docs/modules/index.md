# Modules Overview

Omelette is organized into modular components that form a complete research literature pipeline.

## Core Pipeline

| # | Module | Description |
|---|--------|-------------|
| 1 | [Keywords](/modules/keywords) | Three-level hierarchy, LLM expansion, search formula |
| 2 | [Search](/modules/search) | Federated search across multiple academic sources |
| 3 | [Deduplication](/modules/dedup) | DOI hard match → title similarity → LLM verify |
| 4 | [Subscription](/modules/subscription) | RSS and API-based scheduled updates |
| 5 | [Crawler](/modules/crawler) | PDF download via Unpaywall, arXiv, direct URL |
| 6 | [OCR](/modules/ocr) | MinerU + pdfplumber + PaddleOCR |
| 7 | [RAG](/modules/rag) | LlamaIndex + ChromaDB, hybrid retrieval |
| 8 | [Writing](/modules/writing) | Summarization, citations, gap analysis |

## Pipeline Flow

```
Keywords → Search → Dedup → Subscription → Crawler → OCR → RAG → Writing
```

Each module can be used independently or as part of the full pipeline.

## Extended Modules

Beyond the core pipeline, Omelette includes additional modules for research management:

- **Analysis**: Trend analysis, author networks, gap analysis, impact scoring
- **Collections**: Custom paper groups with AI-suggested tags
- **Concepts**: LLM-powered concept extraction and knowledge graph
- **Chat**: Streaming conversational interface with tool modes
- **Export**: BibTeX, RIS, EndNote, Zotero export
- **Library**: Metadata health check and repair
- **Notifications**: In-app alerts for subscription matches
- **Team Members**: Project collaboration with RBAC
- **Pipelines**: LangGraph orchestration with HITL interrupt/resume
- **Audio Overviews**: LLM-generated paper discussion audio

See the [API Reference](/api/) for complete endpoint documentation.
