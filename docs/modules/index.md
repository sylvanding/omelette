# Modules Overview

Omelette is organized into eight core modules that form a research literature pipeline.

| # | Module | Description |
|---|--------|-------------|
| 1 | [Keywords](/modules/keywords) | Three-level keyword hierarchy, LLM expansion, search formula generation |
| 2 | [Literature Search](/modules/search) | Federated search across Semantic Scholar, OpenAlex, arXiv, Crossref |
| 3 | [Deduplication](/modules/dedup) | DOI hard dedup, title similarity, LLM-verified dedup |
| 4 | [Subscription](/modules/subscription) | RSS feeds and API-based scheduled updates |
| 5 | [PDF Crawler](/modules/crawler) | Unpaywall, arXiv, direct URL fallback |
| 6 | [OCR](/modules/ocr) | pdfplumber + PaddleOCR for scanned PDFs |
| 7 | [RAG Knowledge Base](/modules/rag) | ChromaDB vectors, hybrid retrieval, LLM answers with citations |
| 8 | [Writing Assistant](/modules/writing) | Summarization, citations (GB/T 7714, APA, MLA), review outlines, gap analysis |

## Pipeline Flow

```
Keywords → Search → Dedup → Subscription → Crawler → OCR → RAG → Writing
```

Each module can be used independently or as part of the full pipeline. Projects organize literature; keywords drive search; results flow through dedup, crawl, OCR, and indexing before being queried for writing assistance.
