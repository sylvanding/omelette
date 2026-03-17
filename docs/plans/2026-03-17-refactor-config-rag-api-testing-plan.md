---
title: "refactor: 配置修复 + RAG 召回优化 + 全接口测试"
type: refactor
status: completed
date: 2026-03-17
origin: docs/brainstorms/2026-03-17-config-rag-api-testing-brainstorm.md
---

# 配置修复 + RAG 召回优化 + 全接口测试

## Enhancement Summary

**Deepened on:** 2026-03-17
**Sections enhanced:** 6 (Phase 1 config, Phase 2 reranker/MMR/HNSW/Chat/tests, Phase 3 testing)
**Research agents used:** framework-docs-researcher, best-practices-researcher, performance-oracle, architecture-strategist, security-sentinel, kieran-python-reviewer, learnings-researcher

### Key Improvements

1. **[CRITICAL] Qwen3-Reranker 兼容性修正**: 原生 `Qwen/Qwen3-Reranker-0.6B` 使用 CausalLM 格式，与 `SentenceTransformerRerank` / `CrossEncoder` **不兼容**。必须使用 `tomaarsen/Qwen3-Reranker-0.6B-seq-cls` 变体。
2. **N+1 相邻 chunk 查询修复**: `_get_adjacent_chunks` 每个 node 调用 2 次 ChromaDB，过采样时可达 300 次/请求。需批量化为单次 `collection.get()`。
3. **Reranker 缓存策略修正**: `lru_cache(maxsize=1)` + `top_n` 作为缓存键会导致缓存抖动。改为不含 `top_n`，在调用侧截断。
4. **Reranker 并发安全**: 添加 `asyncio.Semaphore(1)` 防止 PyTorch 推理竞态。
5. **测试基础设施修正**: `conftest_real_llm.py` 不会被 pytest 自动加载 → 合并到 `conftest.py`。
6. **安全强化**: 限制 `knowledge_base_ids` 长度、RAG `top_k` 边界验证、E2E 测试数据隔离。

### New Considerations Discovered

- ChromaDB MMR 支持需要 LlamaIndex PR #19731（2025.08+），需确认当前版本
- HNSW `ef_construction` 和 `M` 为**不可变参数**，仅对新建 collection 生效
- Reranker 0.6B 约占 1.2 GB GPU，与 Embedding 0.6B 共计约 2.5 GB
- `reranker.postprocess_nodes` 需要 `QueryBundle` 而非 `query_str`

---

## Overview

三阶段后端改进：(1) 修复配置三端不一致问题，(2) 实现 RAG 向量召回的 reranking + MMR + HNSW 调优，(3) 对全部 API 端点进行文档化和 mock + 真实 LLM 双轨测试。

## Problem Statement / Motivation

1. **配置脱节**: `config.py` 默认值（`BAAI/bge-m3`）与实际使用的 Qwen3 模型不一致，`.env.example` 混入环境特定配置
2. **RAG 召回质量差**: reranking 是死代码、无结果多样性控制、HNSW 未调优、Chat 端无法控制检索参数
3. **测试覆盖不足**: 229 个测试全用 mock LLM，未验证真实 LLM 端到端行为；上轮重构改动 20 文件未做 E2E 验证

## Proposed Solution

按顺序执行三个阶段，每个阶段独立可测。

## Technical Approach

### Phase 1: 配置一致性修复

**目标**: 同步 `config.py` 默认值、`.env.example`、`.env`

#### Step 1.1: 更新 `config.py` 默认值

**文件**: `backend/app/config.py`

```python
embedding_model: str = "Qwen/Qwen3-Embedding-0.6B"  # was: BAAI/bge-m3
reranker_model: str = "tomaarsen/Qwen3-Reranker-0.6B-seq-cls"  # was: BAAI/bge-reranker-v2-m3
pdf_parser: str = "mineru"                            # was: auto
mineru_timeout: int = 8000                            # was: 300
cuda_visible_devices: str = "5,6,7"                   # was: 0,3
```

#### Step 1.2: 清理 `.env.example`

**文件**: `.env.example`

- `APP_DEBUG=true`（当前 debug 阶段，保持 true）
- `EMBEDDING_MODEL=Qwen/Qwen3-Embedding-8B`（推荐较大模型）
- `RERANKER_MODEL=tomaarsen/Qwen3-Reranker-8B-seq-cls`（推荐较大模型）
- `VOLCENGINE_MODEL=doubao-seed-2-0-mini-260215`（更新模型名）
- `HTTP_PROXY=` 改为通用占位符 `# HTTP_PROXY=http://your-proxy:port`
- 其余保持与当前 `.env.example` 一致

> **Decision**: config.py 默认值 = 实际最小可用（0.6B-seq-cls）；.env.example = 推荐配置（8B-seq-cls）

### Research Insights (Phase 1)

**Qwen3-Reranker 兼容性 [CRITICAL]**:
- 原生 `Qwen/Qwen3-Reranker-*` 使用 `AutoModelForCausalLM` + yes/no token logits，**不能**直接用于 `CrossEncoder` / `SentenceTransformerRerank`
- 社区提供了 seq-cls 转换版本：`tomaarsen/Qwen3-Reranker-0.6B-seq-cls`（和 8B 版本），兼容 `sentence-transformers` `CrossEncoder` API
- 依赖版本要求：`transformers>=4.51.0`，`sentence-transformers>=4.0.0`
- 参考：https://huggingface.co/tomaarsen/Qwen3-Reranker-8B-seq-cls

#### Step 1.3: 验证

- 运行 `pytest` 确认 229 测试全部通过
- 确认 mock 模式不受影响

---

### Phase 2: RAG 向量召回优化

#### Step 2.1: 添加 Reranker 依赖

**文件**: `backend/pyproject.toml`

```toml
[project.optional-dependencies]
ml = [
    # ... existing ...
    "llama-index-postprocessor-sbert-rerank>=0.4.0",
    "sentence-transformers>=4.0.0",
    "transformers>=4.51.0",
]
```

### Research Insights (Step 2.1)

**包名修正**: PyPI 包名为 `llama-index-postprocessor-sbert-rerank`（非 `sentence-transformer-rerank`）。对应导入路径：

```python
from llama_index.postprocessor.sbert_rerank import SentenceTransformerRerank
# 或从 core 导入（如果版本足够新）：
from llama_index.core.postprocessor import SentenceTransformerRerank
```

#### Step 2.2: 创建 Reranker 服务

**文件**: `backend/app/services/reranker_service.py`（新建）

```python
"""Reranker model loading and caching."""
from __future__ import annotations

import asyncio
import logging
from functools import lru_cache
from typing import TYPE_CHECKING

from app.config import settings

if TYPE_CHECKING:
    from llama_index.core.schema import NodeWithScore, QueryBundle

logger = logging.getLogger(__name__)

_reranker_semaphore = asyncio.Semaphore(1)


@lru_cache(maxsize=1)
def _load_reranker(model_name: str):
    """Load and cache a SentenceTransformerRerank by model name only."""
    from llama_index.postprocessor.sbert_rerank import SentenceTransformerRerank
    from app.services.embedding_service import _inject_hf_env

    _inject_hf_env()
    logger.info("Loading reranker model=%s", model_name)
    return SentenceTransformerRerank(
        model=model_name,
        top_n=50,
        device="cuda",
        keep_retrieval_score=True,
    )


def get_reranker(*, model_name: str | None = None):
    """Return a cached reranker. top_n is controlled at call site."""
    name = model_name or settings.reranker_model
    return _load_reranker(name)


async def rerank_nodes(
    nodes: list[NodeWithScore],
    query: str,
    top_n: int,
) -> list[NodeWithScore]:
    """Apply reranker with concurrency control and graceful fallback."""
    try:
        from llama_index.core.schema import QueryBundle as QB

        reranker = get_reranker()
        query_bundle = QB(query_str=query)
        async with _reranker_semaphore:
            reranked = await asyncio.to_thread(
                reranker.postprocess_nodes,
                nodes,
                query_bundle=query_bundle,
            )
        return reranked[:top_n]
    except (ImportError, OSError, RuntimeError):
        logger.warning("Reranking failed, returning original nodes", exc_info=True)
        return nodes[:top_n]
```

### Research Insights (Step 2.2)

**关键设计改进（综合 performance-oracle + architecture-strategist + python-reviewer）**:

1. **缓存策略**: `lru_cache` 只以 `model_name` 为键，`top_n` 在 `rerank_nodes()` 中通过 `[:top_n]` 截断。避免不同 `rag_top_k` 导致缓存抖动和重复加载模型。
2. **并发安全**: `asyncio.Semaphore(1)` 序列化 reranker 推理，避免 PyTorch 模型在多线程下竞态。
3. **HF 环境注入**: 复用 `embedding_service._inject_hf_env()` 设置 HuggingFace 镜像和缓存路径。
4. **`keep_retrieval_score=True`**: 保留原始检索分数，方便调试和质量对比。
5. **`device="cuda"`**: 利用 GPU 加速推理。0.6B 模型约 1.2 GB 显存。
6. **`QueryBundle`**: LlamaIndex `postprocess_nodes` 接受 `QueryBundle` 对象而非 `query_str` 关键字。
7. **异常粒度**: 仅捕获 `ImportError`（包未安装）、`OSError`（模型加载失败）、`RuntimeError`（推理失败），不吞没其他异常。
8. **可测试性**: 测试中调用 `_load_reranker.cache_clear()` 清除缓存。

**GPU 显存估算**:

| 模型 | 显存 | 推荐 |
|------|------|------|
| Qwen3-Embedding-0.6B | ~1.2 GB | GPU 5 |
| Qwen3-Reranker-0.6B-seq-cls | ~1.2 GB | GPU 6 |
| 8B 版本 | ~16 GB 各 | 需独占 GPU |

#### Step 2.3: 实现 Reranking 逻辑

**文件**: `backend/app/services/rag_service.py`

**修改 `query()`**（lines 226-303）:

```python
async def query(self, ..., use_reranker: bool = False, ...):
    oversample = settings.rag_oversample_factor if use_reranker else 1
    fetch_k = min(top_k * oversample, count)
    retriever = index.as_retriever(similarity_top_k=fetch_k)
    retrieved_nodes = await asyncio.to_thread(retriever.retrieve, question)

    if use_reranker and retrieved_nodes:
        from app.services.reranker_service import rerank_nodes
        retrieved_nodes = await rerank_nodes(retrieved_nodes, question, top_n=top_k)

    # 后续处理不变...
```

**修改 `retrieve_only()`**（lines 304-354）:

```python
async def retrieve_only(
    self,
    project_id: int,
    question: str,
    top_k: int = 10,
    use_reranker: bool = False,
) -> list[dict]:
    oversample = settings.rag_oversample_factor if use_reranker else 1
    fetch_k = min(top_k * oversample, count)
    retriever = index.as_retriever(similarity_top_k=fetch_k)
    retrieved_nodes = await asyncio.to_thread(retriever.retrieve, question)

    if use_reranker and retrieved_nodes:
        from app.services.reranker_service import rerank_nodes
        retrieved_nodes = await rerank_nodes(retrieved_nodes, question, top_n=top_k)

    # 后续 adjacent chunk 处理...
```

### Research Insights (Step 2.3)

**N+1 相邻 chunk 查询批量化 [P0 性能修复]**:

当前 `_get_adjacent_chunks` 每个 node 调用 2 次 `collection.get()`。过采样时 `fetch_k = 150`，产生 **300 次 ChromaDB 调用**。

**批量替代方案**:

```python
async def _get_adjacent_chunks_batch(
    self,
    collection: chromadb.Collection,
    nodes: list,
) -> dict[tuple[int, int], tuple[str, str]]:
    """Batch-fetch all adjacent chunks in one ChromaDB call."""
    all_ids: set[str] = set()
    node_keys: list[tuple[int | None, int | None]] = []
    adj_map: dict[tuple, tuple[list[str], list[str]]] = {}

    for n in nodes:
        meta = (n.node if hasattr(n, "node") else n).metadata or {}
        pid, cidx = meta.get("paper_id"), meta.get("chunk_index")
        key = (pid, cidx)
        node_keys.append(key)
        if pid is None or cidx is None:
            adj_map[key] = ([], [])
            continue
        prev_id = f"paper_{pid}_chunk_{cidx - 1}"
        next_id = f"paper_{pid}_chunk_{cidx + 1}"
        all_ids.update([prev_id, next_id])
        adj_map[key] = ([prev_id], [next_id])

    if not all_ids:
        return {k: ("", "") for k in node_keys}

    result = await asyncio.to_thread(
        collection.get, ids=list(all_ids), include=["documents"]
    )
    id_to_doc = dict(zip(result["ids"] or [], result.get("documents") or []))

    return {
        k: (
            "\n".join(id_to_doc.get(i, "") or "" for i in adj_map.get(k, ([], []))[0]),
            "\n".join(id_to_doc.get(i, "") or "" for i in adj_map.get(k, ([], []))[1]),
        )
        for k in node_keys
    }
```

**效果**: 300 次 ChromaDB 调用 → **1 次**。

**检索流程顺序（最佳实践确认）**:

```
Dense retrieval (oversample) → Reranking (relevance) → Adjacent chunk expansion → 返回
```

> MMR 在 retriever 层面通过 `vector_store_query_mode="mmr"` 实现，与 reranking 正交。

#### Step 2.4: MMR 多样性

**文件**: `backend/app/services/rag_service.py`

```python
# 在 retriever 创建时使用 MMR
if use_mmr:
    retriever = index.as_retriever(
        similarity_top_k=fetch_k,
        vector_store_query_mode="mmr",
        vector_store_kwargs={"mmr_threshold": settings.rag_mmr_threshold},
    )
else:
    retriever = index.as_retriever(similarity_top_k=fetch_k)
```

**添加 `use_mmr` 参数**到 `query()` 和 `retrieve_only()`。

### Research Insights (Step 2.4)

**MMR with ChromaDB**:
- LlamaIndex PR #19731（2025.08）为 ChromaVectorStore 添加了 Python 侧 MMR 实现
- 工作方式：从 ChromaDB 获取更多结果，在客户端应用 MMR 算法
- `mmr_threshold` 即 λ：0 = 最大多样性，1 = 纯相关性，**推荐 0.5（平衡）**
- **需确认当前 `llama-index-vector-stores-chroma` 版本 >= 0.4.0**

**参数设计建议**:
- 全局默认通过 `settings.rag_mmr_threshold` 控制（0.0 = 关闭 MMR）
- 暂不暴露 `use_mmr` 到 `ChatStreamRequest`，仅通过配置控制

#### Step 2.5: HNSW 调优

**文件**: `backend/app/services/rag_service.py`

```python
def _get_collection(self, project_id: int) -> chromadb.Collection:
    return self._get_chroma_client().get_or_create_collection(
        name=f"project_{project_id}",
        metadata={
            "hnsw:space": "cosine",
            "hnsw:construction_ef": 200,
            "hnsw:search_ef": 100,
            "hnsw:M": 32,
        },
    )
```

### Research Insights (Step 2.5)

**HNSW 参数详解**:

| 参数 | 值 | 说明 | 可变性 |
|------|-----|------|--------|
| `hnsw:space` | `cosine` | 距离度量 | 不可变 |
| `hnsw:construction_ef` | 200 | 构建时邻居搜索范围（越大越精但更慢） | 不可变 |
| `hnsw:M` | 32 | 每节点最大连接数（越大越精但更耗内存） | 不可变 |
| `hnsw:search_ef` | 100 | 查询时邻居搜索范围 | **可变**，可用 `collection.modify()` |

**对已有 collection 的影响**:
- `space`、`construction_ef`、`M` 为**不可变参数**，仅在 `get_or_create_collection` 创建时生效
- 已有 collection 保持原有参数（默认 `ef_construction=100`, `M=16`）
- **需提供索引重建脚本/说明**：删除旧 collection → 重新索引

**Chroma 版本注意**: Chroma 1.0+ 推荐使用 `configuration={"hnsw": {...}}` 而非 `metadata`。需检查当前安装版本。

#### Step 2.6: 暴露参数到 Chat API

**文件**: `backend/app/schemas/conversation.py`

```python
class ChatStreamRequest(BaseModel):
    conversation_id: int | None = None
    knowledge_base_ids: list[int] = Field(
        default_factory=list,
        max_length=20,
        description="Knowledge base IDs for RAG retrieval",
    )
    model: str | None = None
    tool_mode: str = "qa"
    message: str = Field(min_length=1)
    rag_top_k: int = Field(default=10, ge=1, le=50, description="RAG retrieval top-k")
    use_reranker: bool = Field(default=False, description="Apply reranker to retrieved nodes")
```

**文件**: `backend/app/api/v1/chat.py`

```python
initial_state["rag_top_k"] = req.rag_top_k
initial_state["use_reranker"] = req.use_reranker
```

**文件**: `backend/app/pipelines/chat/nodes.py` (`retrieve_node`)

```python
sources = await rag.retrieve_only(
    project_id=kb_id,
    question=question,
    top_k=state.get("rag_top_k", 10),
    use_reranker=state.get("use_reranker", False),
)
```

**文件**: `backend/app/api/v1/rag.py`（RAG API 对齐）

```python
class RAGQueryRequest(BaseModel):
    question: str
    top_k: int = Field(default=10, ge=1, le=50)  # 添加边界验证
    use_reranker: bool = True  # RAG API 默认启用
```

### Research Insights (Step 2.6)

**API Surface Parity**:

| 参数 | RAG API | Chat API | 说明 |
|------|---------|----------|------|
| `top_k` | `ge=1, le=50`，默认 10 | `ge=1, le=50`，默认 10 | 统一验证 |
| `use_reranker` | 默认 `True` | 默认 `False` | RAG API 面向精确查询（偏质量），Chat 面向流式交互（偏延迟） |
| `knowledge_base_ids` | N/A | `max_length=20` | 限制并行检索数量 |

**安全强化（security-sentinel）**:
- `knowledge_base_ids` 无长度限制 → 50 个 KB × 150 nodes = 7,500 nodes → 添加 `max_length=20`
- RAG `top_k` 无边界 → `top_k=999999` 可能 → 添加 `Field(ge=1, le=50)`
- Chat/RAG 端点建议使用更严格的速率限制（20-30/min vs 全局 120/min）

#### Step 2.7: 添加 RAG 配置项

**文件**: `backend/app/config.py`

```python
# RAG retrieval
rag_default_top_k: int = Field(default=10, ge=1, le=100, description="Default retrieval top-k")
rag_oversample_factor: int = Field(default=3, ge=1, le=10, description="Multiplier for oversampling before rerank")
rag_mmr_threshold: float = Field(default=0.5, ge=0.0, le=1.0, description="MMR diversity threshold (0=off, 0.5=balanced)")
reranker_concurrency_limit: int = Field(default=1, ge=1, le=4, description="Max concurrent reranker calls")
```

#### Step 2.8: 运行测试验证

- 运行全部 229 测试确认无回归
- 测试 `use_reranker=False` 路径（默认行为不变）
- 测试 `use_reranker=True` 路径（mock reranker via `_load_reranker.cache_clear()` + `@patch`）
- 所有 RAG sync 调用确认已包裹 `asyncio.to_thread()`

---

### Phase 3: 全接口文档 + 测试

#### Step 3.1: 生成 API 端点文档

**文件**: `docs/api-endpoints.md`（新建）

整理全部端点（~77-82 个），按模块分组，包含：
- HTTP 方法 + 路径
- 简要描述
- 关键参数
- 是否涉及 LLM 调用
- 测试优先级标记

#### Step 3.2: 扩展测试基础设施

**文件**: `backend/conftest.py`（扩展，不新建文件）

```python
import pytest

REAL_LLM_AVAILABLE = os.environ.get("LLM_PROVIDER", "mock") != "mock"

real_llm = pytest.mark.skipif(
    not REAL_LLM_AVAILABLE,
    reason="Real LLM not configured (set LLM_PROVIDER=volcengine)"
)
```

**文件**: `backend/pyproject.toml`（注册 marker）

```toml
[tool.pytest.ini_options]
markers = [
    "real_llm: marks tests requiring real LLM (deselect with -m 'not real_llm')",
]
```

### Research Insights (Step 3.2)

**测试基础设施修正（architecture-strategist）**:
- `conftest_real_llm.py` **不会被 pytest 自动加载**（只有 `conftest.py` 会）→ 合并到 `conftest.py`
- `--override-ini="LLM_PROVIDER=volcengine"` 不设环境变量 → 改用 `LLM_PROVIDER=volcengine pytest ...`
- `conftest.py` 已使用 `tempfile.mkdtemp()` 做 DB 隔离，新测试自动受益

**Fixture 模式（learnings）**:

```python
@pytest.fixture
async def client():
    """httpx AsyncClient with ASGITransport for in-process testing."""
    from httpx import ASGITransport, AsyncClient
    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
```

**Chat/Stream 测试模式（learnings）**:
- Monkeypatch `_init_services` 注入 mock LLM/RAG，避免 DB 依赖的服务初始化
- SSE 测试：await 完整响应 → 解析 `data:` 行 → 断言事件类型（start、text-delta、finish、[DONE]）
- 参考：`docs/solutions/integration-testing/2026-03-16-fastapi-langgraph-integration-testing-best-practices.md`

#### Step 3.3: 按模块编写测试

**并行化策略**: 开多个 Agent，每个负责一组模块：

| Agent | 模块 | 端点数 | 特点 |
|-------|------|--------|------|
| Agent 1 | Projects + Papers + Upload | ~17 | 纯 CRUD + 文件 I/O |
| Agent 2 | Keywords + Search + Dedup | ~14 | CRUD + LLM 调用 |
| Agent 3 | Chat + RAG + Writing + Completion + Rewrite | ~14 | 全部涉及 LLM，核心流程 |
| Agent 4 | Conversations + Subscriptions + Tasks + Settings + Pipelines | ~22 | 混合：CRUD + 管线 + 配置 |

**每个测试文件结构**:

```python
# tests/test_<module>_e2e.py
import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app

@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

class TestModuleMock:
    """Mock LLM tests — always run."""

    async def test_endpoint_basic(self, client):
        ...

@pytest.mark.real_llm
class TestModuleRealLLM:
    """Real LLM tests — require LLM_PROVIDER=volcengine."""

    async def test_endpoint_with_volcengine(self, client):
        ...
```

#### Step 3.4: E2E 测试（真实服务器）

**启动服务器**:

```bash
cd backend && conda run -n omelette uvicorn app.main:app --host 0.0.0.0 --port 8000
```

**E2E 测试流程**:

1. 创建项目 → 上传 8 篇 PDF → 触发 OCR/索引
2. 创建对话 → Chat 流式交互（qa/citation 模式）
3. RAG query → 验证 reranking 效果
4. Writing 服务 → 摘要/综述
5. Keyword 扩展 → LLM 生成
6. Dedup → LLM 验证/解决

**真实 LLM 断言策略**:
- **结构断言**: 检查响应格式（JSON schema、SSE 事件类型）
- **非空断言**: 检查 LLM 返回非空字符串
- **关键词断言**: 检查输出包含问题中的关键术语
- **不做精确匹配**: LLM 输出不确定，避免精确字符串比对

### Research Insights (Step 3.4)

**E2E 安全（security-sentinel）**:
- E2E 测试必须使用 `APP_ENV=testing`，配置独立 `DATA_DIR`（`tempfile.mkdtemp()`）
- **严禁使用生产 `.env` 和 `/data0/djx/omelette/` 数据目录**
- 添加启动检查：`if APP_ENV == "production": sys.exit("E2E tests cannot run in production")`

**真实 LLM 速率控制**:
- Volcengine 并发限制 → 添加 `asyncio.Semaphore(2)` 限制同时进行的 LLM 测试

```python
_real_llm_semaphore = asyncio.Semaphore(2)

@pytest.fixture
async def real_llm_slot():
    async with _real_llm_semaphore:
        yield
```

**RAG 质量度量（可选）**:
- nDCG@10 衡量 reranking 改进
- MRR 衡量首个命中的排名
- 对比 `use_reranker=True` vs `False` 的结果差异

#### Step 3.5: 运行完整测试套件

```bash
# 1. Mock 测试（快速，CI 用）
pytest tests/ -x -q

# 2. 真实 LLM 测试（慢，手动触发）
LLM_PROVIDER=volcengine pytest tests/ -m real_llm -x -v

# 3. E2E 测试（需启动服务器 + APP_ENV=testing）
APP_ENV=testing pytest tests/test_e2e_full.py -x -v
```

---

## System-Wide Impact

### Interaction Graph

- Config 变更 → 影响所有使用 `settings.embedding_model` / `settings.reranker_model` 的服务
- Reranker 添加 → `reranker_service.py` → `rag_service.py` → `chat/nodes.py` → `ChatStreamRequest`
- HNSW 调优 → 仅影响新建 collection（旧索引需重建）

### Error & Failure Propagation

- Reranker 包未安装 → `ImportError` → `rerank_nodes` 捕获 → 返回原始 top_k 结果
- Reranker 模型加载失败 → `OSError` → 同上 fallback
- GPU OOM → `RuntimeError` → 同上 fallback
- Volcengine API 限流 → 测试 semaphore 控制并发

### State Lifecycle Risks

- HNSW 参数变更 → 旧 collection 不受影响 → 需提供重建脚本
- Reranker 加载是全局单例 + semaphore → 进程内序列化，无并发问题
- adjacent chunk 批量查询 → 单次 ChromaDB 调用，事务完整

### API Surface Parity

- `rag.query()` 和 `rag.retrieve_only()` 同时支持 `use_reranker` 和过采样
- RAG API 默认 `use_reranker=True`（偏质量），Chat API 默认 `False`（偏延迟）
- `top_k` 统一 `ge=1, le=50` 验证

### Integration Test Scenarios

| 场景 | 单元测试无法覆盖的原因 |
|------|------------------------|
| Reranker + Embedding GPU 争用 | 需真实 GPU 负载 |
| RAG 索引 → Chat → RAG query 跨端点 | 跨 endpoint 流程 |
| MinerU 超时 / OCR 失败 | 外部服务行为 |
| Volcengine 速率限制 | 并行请求 |
| ChromaDB 删除后重建索引 | 索引生命周期 |
| Chat 流式 + 多 KB 并行检索 | 并发 + SSE |

---

## Acceptance Criteria

### Phase 1

- [x] `config.py` 默认值使用 `tomaarsen/Qwen3-Reranker-0.6B-seq-cls`（非原生 Qwen3-Reranker）
- [x] `.env.example` 使用 `tomaarsen/Qwen3-Reranker-8B-seq-cls`
- [x] `.env.example` 中 HTTP_PROXY 改为通用占位符
- [x] 229 测试全部通过

### Phase 2

- [x] `llama-index-postprocessor-sbert-rerank` + `sentence-transformers>=4.0.0` 已安装
- [x] `reranker_service.py` 使用 `lru_cache(maxsize=1)` 仅以 `model_name` 为键
- [x] `rerank_nodes()` 使用 `Semaphore(1)` 序列化推理
- [x] `rerank_nodes()` 使用 `QueryBundle` 而非 `query_str`
- [x] `_get_adjacent_chunks` 替换为批量 `_get_adjacent_chunks_batch`
- [x] 过采样使用 `settings.rag_oversample_factor`
- [x] MMR 通过 `settings.rag_mmr_threshold` 控制
- [x] HNSW 参数已调优（ef_construction=200, M=32, ef_search=100）
- [x] `ChatStreamRequest` 支持 `rag_top_k`、`use_reranker`，`knowledge_base_ids` 限制 `max_length=20`
- [x] `RAGQueryRequest.top_k` 添加 `ge=1, le=50`
- [x] Chat pipeline 传递 `rag_top_k` 和 `use_reranker` 到 `initial_state`
- [x] `rank_node` 维持批量 Paper 查询（无 N+1 回归）
- [x] 所有 RAG sync 调用包裹 `asyncio.to_thread()`
- [x] reranker 失败时 graceful fallback（不影响请求）
- [x] 229 + 新增 reranker 测试全部通过（370 passed, 2 skipped）

### Phase 3

- [x] `docs/api-endpoints.md` 文档覆盖全部端点
- [x] `real_llm` marker 注册到 `pyproject.toml`
- [x] real LLM 逻辑合并到 `conftest.py`（非 conftest_real_llm.py）
- [x] 每个端点至少有一个 mock LLM 测试
- [x] 涉及 LLM 的端点有 `@pytest.mark.real_llm` 真实测试
- [ ] E2E 使用 `APP_ENV=testing` 和独立 DATA_DIR
- [ ] 真实 LLM 测试使用 Volcengine semaphore 限流
- [x] SSE 测试验证事件类型（start、text-delta、finish、[DONE]）
- [ ] E2E 流程（上传 → 索引 → 聊天 → 写作）通过

---

## Dependencies & Risks

| 风险 | 严重度 | 缓解措施 |
|------|--------|----------|
| Qwen3-Reranker seq-cls 版本兼容性 | 高 | 先在 notebook 中验证模型加载和推理 |
| GPU 显存不足（Embedding + Reranker） | 中 | 0.6B 共计 ~2.5GB，CUDA 5,6,7 各 80GB 足够 |
| ChromaDB MMR 版本要求 | 中 | 检查 `llama-index-vector-stores-chroma` 版本 ≥ 0.4.0 |
| HNSW 参数仅对新 collection 生效 | 低 | 提供重建脚本，记录迁移步骤 |
| MinerU 服务不可用 | 低 | E2E 测试标记 `@pytest.mark.skipif(not MINERU_AVAILABLE)` |
| Volcengine 限流 | 低 | Semaphore + 重试 |
| `sentence-transformers>=4.0.0` 与现有依赖冲突 | 中 | 安装时检查，必要时固定版本 |

---

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-03-17-config-rag-api-testing-brainstorm.md](docs/brainstorms/2026-03-17-config-rag-api-testing-brainstorm.md)
  - 决策：RAG 优先做 reranking + MMR，BM25 留后续
  - 决策：.env.example 更新为当前实际配置
  - 决策：全部 77 端点 pytest + E2E 双轨测试

### Internal References

- RAG 技术报告: `docs/research/llamaindex-rag-technical-report.md`
- 原始 RAG 计划 Phase 4: `docs/plans/2026-03-11-feat-llamaindex-rag-engine-plan.md`
- Async 最佳实践: `docs/solutions/performance-issues/blocking-sync-calls-asyncio-to-thread.md`
- 测试模式: `docs/solutions/integration-testing/2026-03-16-fastapi-langgraph-integration-testing-best-practices.md`
- N+1 优化: `docs/solutions/performance-issues/2026-03-12-rag-rich-citation-performance-analysis.md`
- Chat 路由: `docs/solutions/integration-issues/2026-03-12-chat-routing-chain-langgraph-aisdk-rewrite.md`

### External References

- Qwen3-Reranker-seq-cls: https://huggingface.co/tomaarsen/Qwen3-Reranker-8B-seq-cls
- LlamaIndex Node Postprocessors: https://docs.llamaindex.ai/en/stable/module_guides/querying/node_postprocessors/
- ChromaDB HNSW Config: https://docs.trychroma.com/docs/collections/configure
- LlamaIndex MMR PR #19731: https://github.com/run-llama/llama_index/pull/19731
- llama-index-postprocessor-sbert-rerank: https://pypi.org/project/llama-index-postprocessor-sbert-rerank/

### Key Files

- `backend/app/services/rag_service.py` — RAG 核心
- `backend/app/services/embedding_service.py` — Embedding 加载
- `backend/app/services/reranker_service.py` — Reranker 加载（新建）
- `backend/app/config.py` — 配置中心
- `backend/app/pipelines/chat/nodes.py` — Chat pipeline
- `backend/app/schemas/conversation.py` — Chat 请求 schema
- `backend/app/api/v1/rag.py` — RAG API
- `backend/conftest.py` — 测试环境设置
