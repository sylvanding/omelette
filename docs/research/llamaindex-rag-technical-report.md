# LlamaIndex for Scientific Literature RAG: Technical Report (2025–2026)

**Date:** March 2026
**Context:** Omelette project evaluation — migration from raw ChromaDB + pdfplumber + PaddleOCR to LlamaIndex-based RAG.

---

## Executive Summary

LlamaIndex is a mature, actively maintained framework (v0.14.x as of Feb 2026) for building RAG systems. It offers structured abstractions (indices, retrievers, node parsers), strong ChromaDB integration, hybrid retrieval, reranking, and citation support. For Omelette’s scientific literature use case, LlamaIndex can improve document parsing, chunking, retrieval quality, and incremental indexing, while keeping your existing OCR pipeline (pdfplumber + PaddleOCR) as an option or complement.

---

## 1. LlamaIndex Architecture (2025–2026)

### Core Abstractions

| Component | Purpose |
|-----------|---------|
| **Indices** | Organize documents/nodes for retrieval. Types: Vector Store, Summary (List), Tree, Keyword Table, Property Graph |
| **Query Engines** | Orchestrate retrieval → postprocessing → response synthesis |
| **Retrievers** | Fetch relevant nodes (vector, BM25, recursive, fusion) |
| **Node Parsers** | Split documents into nodes (chunks) with metadata |
| **Response Synthesizers** | Combine query + retrieved context → LLM response |

### Index Types (from [LlamaIndex Index Guide](https://developers.llamaindex.ai/python/framework/module_guides/indexing/index_guide/))

- **Vector Store Index**: Embeddings + top-k similarity search (primary for RAG)
- **Summary Index**: Sequential nodes; supports embedding or keyword query
- **Tree Index**: Hierarchical traversal from root to leaves
- **Keyword Table Index**: Keyword → node mapping for lexical search
- **Property Graph Index**: Knowledge graph with hybrid retrieval

### Query Pipeline

1. **Retrieval** — Top-k semantic (and optionally keyword) search
2. **Postprocessing** — Rerank, filter, metadata replacement
3. **Response Synthesis** — LLM generates answer from context

### PDF Parsing & OCR

LlamaIndex does **not** ship a built-in OCR engine. It relies on:

- **SimpleDirectoryReader** — Loads PDFs via default extractors (often PyMuPDF or Unstructured)
- **LlamaParse** — Cloud API for complex PDFs (tables, figures, layout)
- **Custom loaders** — You can plug in pdfplumber/PaddleOCR output as `Document` objects

### Structured Extraction

- **Metadata extractors**: `SummaryExtractor`, `QuestionsAnsweredExtractor`
- **LlamaParse**: Layout-aware parsing, tables, figures, markdown/JSON output
- **Unstructured**: Table + non-table elements from PDFs

---

## 2. LlamaIndex vs Current Omelette Implementation

### Current Stack (Omelette)

| Layer | Implementation |
|-------|----------------|
| PDF parsing | pdfplumber (native) + PaddleOCR (scanned) |
| Chunking | Custom: paragraph-based (1024 chars, 100 overlap) + table chunks |
| Vector store | ChromaDB (default embedding) |
| Retrieval | Vector-only, top-k |
| Reranker | Config exists (`BAAI/bge-reranker-v2-m3`) but not wired in code |
| Hybrid | Docs mention BM25; not implemented |
| Citations | Metadata (paper_id, title, page) passed to LLM |
| Incremental | Full rebuild on index; no per-document add/delete |

### Improvements with LlamaIndex

#### 2.1 Document Loaders

**SimpleDirectoryReader** — Batch load from directory:

```python
from llama_index.core import SimpleDirectoryReader

# With custom PDF extractor (e.g., your pdfplumber output)
file_extractor = {'.pdf': your_pdfplumber_loader}
documents = SimpleDirectoryReader("./data", file_extractor=file_extractor).load_data()
```

**LlamaParse** — For complex scientific PDFs (tables, figures, formulas):

```python
from llama_parse import LlamaParse
from llama_index.core import Document

parser = LlamaParse(result_type="markdown", api_key="llx-...")
json_data = parser.get_json_result("paper.pdf")

documents = []
for doc_json in json_data:
    for page in doc_json["pages"]:
        documents.append(
            Document(text=page["text"], metadata={"page_number": page["page"]})
        )
```

**Recommendation:** Keep pdfplumber + PaddleOCR for cost control and offline use. Use LlamaParse selectively for high-value papers with complex layouts.

#### 2.2 Node Parsers

| Parser | Use Case | Omelette Equivalent |
|--------|----------|----------------------|
| **SentenceSplitter** | Fixed-size chunks, sentence boundaries | Similar to current paragraph chunking |
| **HierarchicalNodeParser** | Multi-level chunks | New — enables AutoMergingRetriever |
| **SemanticSplitterNodeParser** | Embedding-based breakpoints | New — better semantic coherence |
| **TokenTextSplitter** | Token-based sizing | Better for LLM context limits |

Example — SentenceSplitter (closest to current behavior):

```python
from llama_index.core.node_parser import SentenceSplitter

splitter = SentenceSplitter(
    chunk_size=1024,
    chunk_overlap=100,
)
nodes = splitter.get_nodes_from_documents(documents)
```

Example — HierarchicalNodeParser + AutoMergingRetriever:

```python
from llama_index.core.node_parser import HierarchicalNodeParser

node_parser = HierarchicalNodeParser.from_defaults(
    chunk_sizes=[2048, 512, 128]  # Large → medium → small
)
```

#### 2.3 ChromaDB Integration

```python
import chromadb
from llama_index.core import VectorStoreIndex, StorageContext
from llama_index.vector_stores.chroma import ChromaVectorStore
from llama_index.embeddings.huggingface import HuggingFaceEmbedding

db = chromadb.PersistentClient(path="./chroma_db")
chroma_collection = db.get_or_create_collection("project_1", metadata={"hnsw:space": "cosine"})

embed_model = HuggingFaceEmbedding(model_name="BAAI/bge-m3")  # Match your config
vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
storage_context = StorageContext.from_defaults(vector_store=vector_store)

index = VectorStoreIndex.from_documents(
    documents, storage_context=storage_context, embed_model=embed_model
)
```

**Note:** Your config uses `BAAI/bge-m3`; ChromaDB’s default is different. LlamaIndex lets you explicitly set the embedding model.

#### 2.4 Hybrid Retrieval (Vector + BM25)

```python
from llama_index.retrievers.bm25 import BM25Retriever
from llama_index.core.retrievers import QueryFusionRetriever

vector_retriever = index.as_retriever(similarity_top_k=5)
bm25_retriever = BM25Retriever.from_defaults(
    docstore=index.docstore, similarity_top_k=10
)

retriever = QueryFusionRetriever(
    [vector_retriever, bm25_retriever],
    retriever_weights=[0.6, 0.4],
    similarity_top_k=10,
    num_queries=1,  # 1 = no query expansion
    mode="relative_score",
    use_async=True,
)
```

#### 2.5 Reranking

```python
from llama_index.postprocessor import SentenceTransformerRerank

rerank_postprocessor = SentenceTransformerRerank(
    top_n=5,
    model="BAAI/bge-reranker-v2-m3",  # Match your config
    keep_retrieval_score=True,
)

query_engine = index.as_query_engine(
    similarity_top_k=15,  # Retrieve more, rerank down
    node_postprocessors=[rerank_postprocessor],
)
```

#### 2.6 Citation / Source Tracking

LlamaIndex `Response` includes `source_nodes`:

```python
response = query_engine.query("What methods are used for attention?")
# response.response — answer text
# response.source_nodes — List[NodeWithScore] with node.get_content(), metadata

for node_with_score in response.source_nodes:
    node = node_with_score.node
    meta = node.metadata  # paper_id, paper_title, page_number, etc.
    text = node.get_content()
```

Your existing metadata (paper_id, paper_title, page_number, chunk_type) maps directly to node metadata.

#### 2.7 Incremental Indexing

```python
# Add documents without full rebuild
index.insert_nodes(nodes)

# Delete by ref_doc_id (removes all nodes for that document)
index.delete_ref_doc(ref_doc_id="paper_123", delete_from_docstore=True)

# ChromaVectorStore also supports:
# vector_store.delete(node_ids=[...])
# vector_store.delete(filters=[MetadataFilter(key="paper_id", value=123)])
```

---

## 3. LlamaIndex + LangChain Integration

### Compatibility

- LangChain has native LlamaIndex support.
- LlamaIndex provides `LangChainLLM` to wrap LangChain LLMs.

### Recommended Pattern (2025)

**Hybrid “tooling” approach:**

- **LlamaIndex** — Data plane: loaders, parsing, indexing, retrieval
- **LangGraph** — Control plane: orchestration, state, agents

Use LlamaIndex as a retrieval tool inside LangGraph:

```python
# LangGraph agent calls LlamaIndex retriever as a tool
from langchain_community.retrievers import LlamaIndexRetriever

retriever = LlamaIndexRetriever(index.as_retriever())
# Use in LangGraph tool
```

Or use LlamaIndex’s `LangChainLLM` to keep everything in LlamaIndex:

```python
from llama_index.llms.langchain import LangChainLLM
from langchain_community.llms import YourLangChainLLM

llm = LangChainLLM(llm=YourLangChainLLM(...))
# Pass to LlamaIndex Settings or query engine
```

**For Omelette:** Staying within LlamaIndex is simpler. Use LangChain only if you need LangGraph-style agent workflows.

---

## 4. LlamaIndex Workflows vs LangGraph

### LlamaIndex Workflows (2025)

- Event-driven orchestration
- Data-centric: RAG, ingestion, indexing, Q&A
- Declarative, modular
- Good for: complex RAG pipelines, multi-source ingestion

### LangGraph

- Graph-based state machine
- Agent-centric: multi-agent, state, branching
- Good for: multi-step reasoning, tool use, stateful agents

### When to Use Which

| Use Case | Prefer |
|----------|--------|
| RAG, document indexing, retrieval | LlamaIndex Workflows |
| Multi-agent, complex state, tool chains | LangGraph |
| RAG inside an agent | LangGraph + LlamaIndex retriever |

---

## 5. Package Recommendations

### Core (Required)

```bash
pip install llama-index-core
pip install llama-index-vector-stores-chroma
pip install chromadb
```

### Embeddings (Match Omelette Config)

```bash
pip install llama-index-embeddings-huggingface
# Uses sentence-transformers; BAAI/bge-m3 supported
```

### Optional

```bash
# BM25 hybrid retrieval
pip install llama-index-retrievers-bm25

# Reranking
pip install llama-index-postprocessor-sentence-transformer-rerank

# LlamaParse (cloud PDF parsing)
pip install llama-parse

# LangChain integration (if needed)
pip install langchain-community
```

### Minimal Omelette Additions

```toml
# Add to backend/pyproject.toml [project.dependencies]
"llama-index-core>=0.14.0",
"llama-index-vector-stores-chroma>=0.5.0",
"llama-index-embeddings-huggingface>=0.3.0",
```

Optional:

```toml
"llama-index-retrievers-bm25>=0.2.0",
"llama-index-postprocessor-sentence-transformer-rerank>=0.2.0",
```

---

## 6. Best Practices for Scientific Literature

### Multi-Modal (Tables, Figures, Formulas)

- **Tables**: LlamaParse Agentic/Agentic Plus, or Unstructured + Table Transformer
- **Figures**: GPT-4V / LLaVA for image→text; store as nodes with `chunk_type="figure"`
- **Formulas**: LlamaParse preserves LaTeX; consider dedicated math extractors for heavy math

### Metadata Extraction

```python
from llama_index.core.extractors import SummaryExtractor, QuestionsAnsweredExtractor

extractors = [
    SummaryExtractor(summaries=["self"]),
    QuestionsAnsweredExtractor(questions=5),
]
# Run on nodes before indexing
```

### Citation Graphs

- Property Graph Index for entity/relation extraction
- Or: keep citation metadata on nodes and build graph in application layer

### Chunking for Papers

- Prefer **SentenceSplitter** or **SemanticSplitterNodeParser** over naive character splits
- Use **HierarchicalNodeParser** if you want AutoMergingRetriever
- Preserve `page_number`, `section`, `chunk_type` (text/table/figure) in metadata

---

## 7. LlamaParse

### Capabilities

- Layout-aware parsing
- Tables, charts, images, diagrams
- Output: text, markdown, JSON
- Formats: PDF, DOCX, PPTX, XLSX, etc.
- Version pinning for production

### Pricing (2025)

- **Credits:** 1,000 credits = $1.25
- **Tiers:**
  - Fast: 1 credit/page
  - Cost Effective: 3 credits/page
  - Agentic: 10 credits/page
  - Agentic Plus: 45 credits/page
  - **Scientific Papers preset:** 90 credits/page

### Plans

| Plan | Credits/mo | Users |
|------|------------|-------|
| Free | 10K | 1 |
| Starter | 40K + pay-as-you-go to 400K | 5 |
| Pro | 400K + pay-as-you-go to 4M | 10 |
| Enterprise | Custom | Unlimited |

### Alternatives to LlamaParse

| Tool | Pros | Cons |
|------|------|------|
| **pdfplumber + PaddleOCR** (current) | Free, offline, good for text | Tables/figures weaker |
| **Unstructured** | Open source, tables | Setup and tuning |
| **PyMuPDF** | Fast, lightweight | Limited layout |
| **Docling** | Layout-aware, open | Newer, less ecosystem |
| **Azure Document Intelligence** | Strong accuracy | Cost, cloud |

**Recommendation:** Keep pdfplumber + PaddleOCR as default. Use LlamaParse Cost Effective or Agentic for papers where layout/tables matter and budget allows.

---

## 8. Migration Path for Omelette

### Phase 1: Add LlamaIndex Alongside Current Stack

1. Install `llama-index-core`, `llama-index-vector-stores-chroma`, `llama-index-embeddings-huggingface`
2. Create `LlamaIndexRAGService` that:
   - Converts existing `PaperChunk` rows to LlamaIndex `Node` objects
   - Uses `ChromaVectorStore` with `HuggingFaceEmbedding(model_name="BAAI/bge-m3")`
   - Builds `VectorStoreIndex` from nodes
3. Route a subset of queries to the new service for A/B comparison

### Phase 2: Improve Retrieval

1. Add BM25 hybrid retrieval via `QueryFusionRetriever`
2. Add `SentenceTransformerRerank` with `BAAI/bge-reranker-v2-m3`
3. Tune `retriever_weights` and `top_n` based on evaluation

### Phase 3: Better Chunking

1. Replace custom chunking with `SentenceSplitter` or `SemanticSplitterNodeParser`
2. Optionally add `HierarchicalNodeParser` + `AutoMergingRetriever` for richer context

### Phase 4: Incremental Indexing

1. Use `index.insert_nodes()` when new papers are OCR’d
2. Use `index.delete_ref_doc()` when papers are removed
3. Avoid full index rebuilds for routine updates

### Phase 5: Optional LlamaParse

1. Add LlamaParse as an optional parser for selected papers
2. Use Cost Effective (3 credits/page) for typical papers
3. Use Scientific Papers preset (90 credits/page) only for critical documents

---

## 9. Deprecation Check

- **LlamaIndex:** Actively maintained (v0.14.14, Feb 2026). No announced deprecation.
- **Deprecated pieces:** `ServiceContext` → `Settings`; `GPTSimpleVectorIndex` → `VectorStoreIndex`; `AgentRunner` → `AgentWorkflow`. Use current APIs.
- **LlamaParse:** Commercial SaaS; no deprecation.

---

## 10. References

- [LlamaIndex OSS Documentation](https://developers.llamaindex.ai/python/framework/)
- [Index Guide](https://developers.llamaindex.ai/python/framework/module_guides/indexing/index_guide/)
- [Node Parser Modules](https://developers.llamaindex.ai/python/framework/module_guides/loading/node_parsers/modules/)
- [Chroma Integration](https://developers.llamaindex.ai/python/framework/integrations/vector_stores/chromaindexdemo/)
- [LlamaParse Pricing](https://www.llamaindex.ai/pricing)
- [LlamaParse v2 Announcement](https://www.llamaindex.ai/blog/introducing-llamaparse-v2-simpler-better-cheaper)
