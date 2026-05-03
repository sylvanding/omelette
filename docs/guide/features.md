# Features

## Literature Pipeline

### Keywords
- Three-level hierarchy (L1 main term, L2 sub-term, L3 specific)
- LLM-powered term expansion and related concept discovery
- Auto-generated search formulas for Web of Science, Scopus, PubMed

### Multi-Source Search
- Federated search across Semantic Scholar, OpenAlex, arXiv, Crossref
- Standardized metadata with DOI matching
- Batch import with conflict detection

### Deduplication
- Three-stage: DOI exact → title fingerprint → LLM verification
- Side-by-side comparison with keep/skip/replace actions
- Batch auto-resolve with LLM

### Crawler
- Multi-channel: Unpaywall → arXiv → direct URL
- Status tracking per paper
- Bulk download with priority modes

### OCR
- MinerU for born-digital PDFs (auto-managed subprocess)
- PaddleOCR for scanned documents
- pdfplumber for native text extraction
- GPU acceleration with TTL-based model management

### Subscriptions
- RSS feeds and API-based scheduled updates
- Configurable frequency (daily/weekly/monthly)
- Quick update check without creating subscription

## AI & Knowledge

### RAG Knowledge Base
- LlamaIndex + ChromaDB vector store
- BAAI/bge-m3 GPU-aware embeddings
- Hybrid retrieval with bge-reranker-v2-m3 reranking
- Cited answers with source attribution

### Chat Playground
- ChatGPT-style streaming interface
- Tool modes: Q&A, Citation Lookup, Review Outline, Gap Analysis
- Multi-KB parallel retrieval
- Conversation history and management

### LangGraph Pipeline
- StateGraph-based search and upload workflows
- Conditional edges for branching logic
- HITL interrupt/resume for deduplication conflicts
- MemorySaver checkpointing (SqliteSaver planned)

### Writing Assistant
- Summarization, citation formatting, review outlines
- Gap analysis with novelty/feasibility scoring
- Multi-format citation export (GB/T 7714, APA, MLA, Chicago, IEEE)

## Research Tools

### Analytics Dashboard
- Reading progress breakdown
- Weekly read bar chart
- Top journals list
- Reading activity heatmap (GitHub-style)

### Trend Analysis
- Year-binned publication volume
- Citations over time
- Emerging/declining topic detection

### Author Network
- d3-force directed graph of co-authorship
- Centrality metrics and filtering
- SVG/PNG export

### Gap Analysis
- LLM-powered research opportunity identification
- Novelty and feasibility scoring
- Candidate research questions

### Paper Comparison
- Side-by-side abstract, metadata, and citation comparison
- Visual diff highlighting
- Works with 2-5 papers

### Citation Tools
- APA, MLA, Chicago, IEEE, GB/T 7714 styles
- Bibliography builder with paper selection
- Citation style picker with live preview

### Version Tracking
- Semantic Scholar polling for updates
- Version history with diff generation
- Upgrade preservation

## Collaboration

- **Team Members**: Invite with email, role assignment (read/write/admin), RBAC middleware
- **API Keys**: SHA-256 hashed, scope-based access, `omk_` prefix
- **Collections**: Custom paper groups with color coding and AI-suggested tags
- **MCP Server**: Model Context Protocol for AI IDE integration

## User Experience

- **i18n**: Complete Chinese/English bilingual support
- **Reading Goals**: Daily/weekly targets with streak tracking
- **Reading History**: Session tracking with time stats
- **Notes Dashboard**: Project-wide notes with Markdown/LaTeX rendering
- **PWA**: Installable with service worker offline caching
- **Responsive**: Mobile-optimized with horizontal scroll navigation
