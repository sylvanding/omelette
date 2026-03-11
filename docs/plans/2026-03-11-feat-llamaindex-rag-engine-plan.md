---
title: "feat: LlamaIndex RAG 引擎升级与本地 GPU Embedding"
type: feat
status: active
date: 2026-03-11
origin: docs/brainstorms/2026-03-11-ux-architecture-upgrade-brainstorm.md
---

# feat: LlamaIndex RAG 引擎升级与本地 GPU Embedding

## 1. Overview

### 1.1 当前 RAG 限制

| 维度 | 现状 | 影响 |
|------|------|------|
| **Embedding** | ChromaDB 默认模型，bge-m3 配置未使用 | 无法控制 embedding 质量，多语言支持受限 |
| **分块** | 自定义段落+表格分块（ocr_service.chunk_text） | 固定 chunk_size=1024，无语义边界，表格单独 chunk 逻辑分散 |
| **检索** | 纯向量 `query_texts → top-k` | 关键词检索缺失，长尾查询召回差 |
| **重排序** | `use_reranker` 参数存在但未实现 | 无精排，检索结果质量不稳定 |
| **索引** | 全量重建 | 每次重建需全量 embedding，耗时且不可增量 |
| **引用** | 手动拼接 source 元数据 | 来源追踪不完整，缺乏 LlamaIndex 原生 node 支持 |

### 1.2 LlamaIndex 能带来什么

- **统一抽象**：Embedding、VectorStore、Retriever、PostProcessor 标准化接口
- **混合检索**：Vector + BM25 融合，支持 Reciprocal Rank Fusion / 加权融合
- **重排序**：SentenceTransformerRerank 原生支持 bge-reranker-v2-m3
- **增量索引**：`insert_nodes()` / `delete_ref_doc()` 无需全量重建
- **引用追踪**：`response.source_nodes` 自动返回来源，元数据可传递到前端
- **分块策略**：SentenceSplitter、SemanticSplitter、HierarchicalNodeParser 可选
- **云端备选**：OpenAI / DashScope Embedding API 作为无 GPU 时的 fallback

---

## 2. Technical Approach

### 2.1 Embedding 层

| 模式 | 实现 | 配置 |
|------|------|------|
| **本地 GPU** | `HuggingFaceEmbedding("BAAI/bge-m3", device="cuda")` | `EMBEDDING_PROVIDER=local` |
| **多 GPU** | 可选 `torch.nn.DataParallel` 包装（需自定义，LlamaIndex 原生不支持） | `CUDA_VISIBLE_DEVICES=6,7` |
| **云端 API** | `OpenAIEmbedding` / `DashScopeEmbedding`（阿里云） | `EMBEDDING_PROVIDER=api` |

**GPU 自动检测**：
- `torch.cuda.is_available()` + `torch.cuda.device_count()`
- 有 GPU 时默认 `device="cuda"`，无 GPU 时 `device="cpu"` 或 fallback 到 API

**Ubuntu vs Windows**：
- CUDA 在两者上均通过 `torch.cuda` 暴露，逻辑一致
- Windows 需确保 CUDA 驱动与 PyTorch 版本匹配；`CUDA_VISIBLE_DEVICES` 在 Windows 10+ 支持

**配置项**：
```env
EMBEDDING_PROVIDER=local          # local | api
EMBEDDING_MODEL=BAAI/bge-m3
EMBEDDING_API_KEY=                # OpenAI / DashScope API Key（api 模式）
CUDA_VISIBLE_DEVICES=6,7
```

### 2.2 分块策略

| 策略 | 适用场景 | 参数 |
|------|----------|------|
| **SentenceSplitter** | 默认，通用 | `chunk_size=512`, `chunk_overlap=50` |
| **SemanticSplitterNodeParser** | 基于 embedding 的语义边界 | 需 embedding 模型，适合长文档 |
| **HierarchicalNodeParser** | 父子 chunk，父块保留大上下文 | 适合需要多粒度检索的场景 |

**保留元数据**（与现有 PaperChunk 对齐）：
- `paper_id`, `paper_title`, `section`, `page_number`, `chunk_type` (text/table)

**与 OCR 的衔接**：
- 现有 `ocr_service.chunk_text()` 仍可产出 chunks，但需转换为 LlamaIndex `Document` / `Node`
- 或由 LlamaIndex 的 NodeParser 直接处理 OCR 输出的原始文本（需评估与现有 OCR 流水线的集成点）

### 2.3 向量存储

- **ChromaVectorStore**：LlamaIndex 官方 ChromaDB 集成，替换直接 `chromadb.Client` 调用
- **Per-project 隔离**：collection 名保持 `project_{id}`，与现有逻辑一致
- **持久化**：`chroma_db_dir` 沿用，路径不变

### 2.4 混合检索

- **Vector + BM25**：`QueryFusionRetriever` 或 `HybridFusionRetrieverPack`
- **向量**：ChromaVectorStore 的 VectorStoreIndex
- **BM25**：`BM25Retriever` 基于 docstore 或内存索引
- **权重**：`vector_weight` / `bm25_weight` 可配置（如 0.7 / 0.3）

### 2.5 重排序

- **SentenceTransformerRerank**：`model_name="BAAI/bge-reranker-v2-m3"`
- **本地 GPU**：`device="cuda"` 自动检测
- **top_n**：重排序后保留 top_n（如 5），可配置

### 2.6 增量索引

- **添加**：`index.insert_nodes(nodes)` 或 `index.insert_documents(docs)`
- **删除**：`index.delete_ref_doc(ref_doc_id)` 按 ref_doc_id 删除
- **ref_doc_id**：`paper_{paper_id}` 或 `paper_{paper_id}_chunk_{chunk_index}` 以支持删除单篇或单 chunk

### 2.7 引用追踪

- **`response.source_nodes`**：LlamaIndex 查询返回的 `Response` 对象包含 source_nodes
- **元数据**：每个 node 的 `metadata` 含 paper_id、paper_title、page_number 等
- **前端**：引用卡片展示 `paper_title`、`page_number`、`excerpt`、`relevance_score`

### 2.8 LlamaParse（可选）

- **用途**：PDF 解析的增强选项，对复杂版式论文解析质量更高
- **配置**：`USE_LLAMAPARSE=false`（默认），`LLAMAPARSE_API_KEY` 可选
- **优先级**：PaddleOCR 仍为默认，LlamaParse 仅在用户显式启用时使用

---

## 3. Implementation Phases

### Phase 1: Embedding 服务（GPU 检测 + 本地/API 双模式）

**目标**：可切换的 Embedding 层，支持本地 GPU 与云端 API

**任务**：
- [ ] 新增 `app/services/embedding_service.py`：封装 Embedding 工厂
- [ ] GPU 检测：`torch.cuda.is_available()`、`torch.cuda.device_count()`
- [ ] 本地模式：`HuggingFaceEmbedding` + `device="cuda"` / `"cpu"`
- [ ] API 模式：`OpenAIEmbedding` / `DashScopeEmbedding`（阿里云）
- [ ] 配置：`EMBEDDING_PROVIDER`, `EMBEDDING_MODEL`, `EMBEDDING_API_KEY`
- [ ] 单元测试：mock GPU 检测，验证 API 模式

### Phase 2: LlamaIndex 向量存储集成（替换直接 ChromaDB）

**目标**：用 LlamaIndex ChromaVectorStore 替代 `rag_service.py` 中的直接 ChromaDB 调用

**任务**：
- [ ] 引入 `llama-index-vector-stores-chroma`
- [ ] 重构 `RAGService`：使用 `ChromaVectorStore` + `VectorStoreIndex`
- [ ] 保持 `project_{id}` collection 命名
- [ ] `index_chunks` 改为 `insert_nodes` 或 `insert_documents`
- [ ] `query` 改为使用 `VectorStoreIndex.as_retriever()`
- [ ] 保持 `delete_index`、`get_stats` 语义

### Phase 3: 分块策略升级（SentenceSplitter → SemanticSplitter）

**目标**：支持多种分块策略，保留元数据

**任务**：
- [ ] 引入 `SentenceSplitter` 作为默认
- [ ] 将 OCR chunks 转为 LlamaIndex `Document` / `Node`，保留 metadata
- [ ] 可选：`SemanticSplitterNodeParser` 作为高级选项

### Phase 4: 混合检索 + 重排序

**目标**：Vector + BM25 融合，bge-reranker 精排

**任务**：
- [ ] 引入 `llama-index-retrievers-bm25`、`QueryFusionRetriever` 或 `HybridFusionRetrieverPack`
- [ ] 引入 `llama-index-postprocessor-sentence-transformer-rerank`
- [ ] 配置 `vector_weight`、`bm25_weight`、`top_n` 重排序
- [ ] API 参数 `use_reranker` 实际生效

### Phase 5: 增量索引 + 引用追踪

**目标**：支持增量添加/删除，完善引用返回

**任务**：
- [ ] 实现 `insert_nodes` 增量添加
- [ ] 实现 `delete_ref_doc` 删除单篇/单 chunk
- [ ] 重构 `query` 返回 `source_nodes`，映射到前端引用格式
- [ ] 更新 API 响应 schema，包含 `citation` 结构

---

## 4. Migration Strategy

### 4.1 迁移步骤

1. **依赖安装**：添加 LlamaIndex 相关 pip 包（见 Dependencies）
2. **配置迁移**：新增 `EMBEDDING_PROVIDER` 等 env，默认 `local`
3. **渐进替换**：
   - Phase 1 完成后，Embedding 可独立测试
   - Phase 2 完成后，RAG 查询改用 LlamaIndex，但分块仍用现有 OCR chunks
   - Phase 3–5 逐步启用新分块、混合检索、重排序、增量索引
4. **重新索引**：迁移后需**全量重建**索引，因为：
   - 向量存储格式可能变化（LlamaIndex Node vs 原始 ChromaDB）
   - Embedding 模型从 ChromaDB 默认切换为 bge-m3
   - 建议：先备份 `chroma_db_dir`，迁移完成后执行「全量重建索引」API

### 4.2 回滚方案

- 保留旧 `RAGService` 逻辑在分支或注释中
- 通过 feature flag 或环境变量切换新旧实现（可选）

---

## 5. GPU Detection Logic

```python
# 伪代码：app/services/embedding_service.py

def detect_gpu() -> tuple[bool, str]:
    """
    检测 GPU 可用性。
    Returns:
        (has_gpu, device): 有 GPU 时 device="cuda"，否则 "cpu"
    """
    try:
        import torch
        if torch.cuda.is_available():
            count = torch.cuda.device_count()
            if count > 0:
                # 可选：CUDA_VISIBLE_DEVICES 已在 env 中限制可见设备
                return True, "cuda"
    except ImportError:
        pass
    return False, "cpu"


def get_embedding_model(provider: str, model: str) -> BaseEmbedding:
    has_gpu, device = detect_gpu()

    if provider == "local":
        if has_gpu:
            return HuggingFaceEmbedding(model_name=model, device=device)
        else:
            # 无 GPU 时仍可用 CPU，但较慢；可考虑 fallback 到 API
            return HuggingFaceEmbedding(model_name=model, device="cpu")

    elif provider == "api":
        # 使用 OpenAI / DashScope 等 API
        return OpenAIEmbedding(...)  # 或 DashScopeEmbedding
```

**Ubuntu vs Windows**：
- `torch.cuda.is_available()` 在两者上行为一致
- Windows 需安装对应 CUDA 版本 PyTorch（如 `pip install torch --index-url https://download.pytorch.org/whl/cu121`）
- `CUDA_VISIBLE_DEVICES` 在 Windows 上可用（需验证具体版本）

---

## 6. Performance Considerations

| 维度 | 现状 | 升级后 | 建议 |
|------|------|--------|------|
| **索引速度** | ChromaDB 默认 embedding，较快 | bge-m3 本地 GPU 需加载模型，首批较慢 | 增大 `embed_batch_size`，避免 `parallel_process=True`（多进程开销大） |
| **检索延迟** | 纯向量，~50–200ms | 混合检索 + 重排序，~200–500ms | 可配置关闭重排序以降低延迟 |
| **内存** | 低 | bge-m3 ~2GB，reranker ~1GB | 无 GPU 时慎用本地模型，建议 API fallback |
| **增量索引** | 无，全量重建 | 有，仅新增/删除部分 | 大幅减少重建时间 |

---

## 7. Acceptance Criteria

### 7.1 功能验收

- [ ] **Embedding**：本地 GPU 模式下 `bge-m3` 正确加载并产生 embedding
- [ ] **Embedding**：API 模式下可调用 OpenAI / DashScope 产生 embedding
- [ ] **GPU 检测**：无 GPU 时自动 fallback 到 CPU 或 API，不报错
- [ ] **向量存储**：`index_chunks` 可成功索引，`get_stats` 返回正确 chunk 数
- [ ] **检索**：`query` 返回相关 chunks，且 `sources` 包含 paper_id、paper_title、page_number
- [ ] **混合检索**：启用时，BM25 与向量结果融合正确
- [ ] **重排序**：`use_reranker=true` 时，返回结果顺序与未重排序不同
- [ ] **增量索引**：添加新论文后仅索引新 chunks，无需全量重建
- [ ] **删除**：`delete_ref_doc` 或删除项目后，对应 chunks 从索引中移除

### 7.2 兼容性验收

- [ ] **Ubuntu**：`torch.cuda.is_available()` 在 GPU 环境下为 True
- [ ] **Windows**：在满足 CUDA 环境时，行为与 Ubuntu 一致（测试不通过可后续处理）

### 7.3 非功能验收

- [ ] 索引 100 篇论文（约 1000 chunks）在 5 分钟内完成（本地 GPU）
- [ ] 单次 query 延迟 < 2s（含重排序）
- [ ] 现有 RAG API 契约（`/api/v1/projects/{id}/rag/query` 等）保持兼容或仅扩展字段

---

## 8. Dependencies

### 8.1 新增 pip 包

```toml
# pyproject.toml 新增

# LlamaIndex 核心
llama-index-core>=0.12.0
llama-index-vector-stores-chroma>=0.4.0
llama-index-embeddings-huggingface>=0.4.0
llama-index-embeddings-openai>=0.4.0
llama-index-retrievers-bm25>=0.4.0
llama-index-postprocessor-sentence-transformer-rerank>=0.3.0

# 已有（可选）
sentence-transformers>=4.0.0
torch>=2.6.0
```

### 8.2 可选

- `llama-index-embeddings-dashscope`：若使用阿里云 DashScope Embedding
- `llama-parse`：若启用 LlamaParse

### 8.3 现有依赖保留

- `chromadb>=0.6.0` 保留
- `ml` 可选依赖中的 `sentence-transformers`、`torch` 建议升级为正式依赖（若启用本地 embedding）
