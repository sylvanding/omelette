# Brainstorm: 配置修复 + RAG 召回优化 + 全接口测试

**Date**: 2026-03-17
**Status**: Approved

## What We're Building

三阶段改进：
1. **配置一致性修复** — 同步 `config.py` 默认值、`.env.example`、`.env` 三者
2. **向量召回优化** — 实现 reranking + MMR 多样性 + HNSW 调优（BM25 混合检索留作后续迭代）
3. **全接口文档 + 测试** — 77 个 API 端点的文档化 + pytest 单元测试 + E2E 真实 LLM 测试

## Why This Approach

### 配置修复
当前 `config.py` 默认值（`BAAI/bge-m3`）与实际使用的 Qwen3 模型脱节，`.env.example` 混入了环境特定配置（`CUDA=5,6,7`）。这会导致新开发者环境搭建困惑。

### RAG 优化
当前向量召回仅有 dense search，reranking 虽有配置但完全未实现（死代码）。对于学术文献检索，缺少精确术语匹配（BM25）和结果多样性（MMR）会严重影响检索质量。

### 全接口测试
上一轮重构修改了 20 个文件，现有 229 个测试只覆盖 mock 场景。需要真实 LLM（Volcengine doubao-seed-2-0-mini）验证端到端行为。

## Key Decisions

1. **配置策略**: `.env.example` 更新为当前实际使用的配置（debug=true, mineru, Qwen3 模型等）
2. **RAG 优化范围**: reranking + MMR + HNSW 调优（BM25 混合检索复杂度高，留作后续迭代）
3. **Embedding 模型**: Qwen/Qwen3-Embedding-0.6B（`.env` 实际）；`.env.example` 推荐 8B 版本
4. **Reranker 模型**: Qwen/Qwen3-Reranker-0.6B（实际）；config.py 默认更新
5. **测试范围**: 全部 77 个端点，pytest + E2E 双轨
6. **测试 LLM**: Volcengine doubao-seed-2-0-mini（真实 LLM）+ mock（现有测试）
7. **测试数据**: 8 篇 VR/生物化学 PDF 位于 `/data0/djx/omelette_pdf_test/`
8. **PaddleOCR**: 保留作为扫描 PDF 后备方案，MinerU 为主力 parser

## Resolved Questions

- **Embedding 模型默认值**: config.py 默认更新为 Qwen3-Embedding-0.6B（与 .env 一致）
- **Reranker 实现方式**: 使用 LlamaIndex 内置 reranker + Qwen3-Reranker
- **混合检索方案**: 暂不实现 BM25，reranker 已能弥补精确匹配不足；后续如需可用 LlamaIndex QueryFusionRetriever
- **测试并行化**: 按模块拆分，开多个 Agent 并行测试不同模块
- **服务器状态**: 未运行，需要启动用于 E2E 测试

## Architecture Notes

### 向量召回优化架构

```
User Question
    ↓
Dense Retrieval: Qwen3-Embedding → ChromaDB HNSW (cosine, top_k * 3)
    ↓
Reranking: Qwen3-Reranker (shrink to top_k)
    ↓
MMR Diversity Filter (reduce redundant chunks from same paper/section)
    ↓
Adjacent Chunk Expansion (window=1)
    ↓
Sources → LLM Generation
```

**后续迭代（不在本次范围）**: BM25 稀疏检索 + RRF 融合、Query Expansion

### 测试架构

```
Test Suite
├── pytest (unit + integration)
│   ├── mock LLM → 现有 229 测试
│   └── real LLM → 新增 Volcengine 测试
└── E2E (live server)
    ├── 启动 FastAPI server (port 8000)
    ├── 多 Agent 并行测试各模块
    └── 测试数据: 8 篇 PDF 论文
```

## Risks & Constraints

1. **Reranker GPU 内存**: Qwen3-Reranker-0.6B 需要额外 GPU 内存；与 embedding 模型共用 GPU 5,6,7 可能有竞争
2. **E2E 测试稳定性**: 真实 LLM 响应不确定，测试断言需要模糊匹配而非精确比对
3. **MinerU 服务依赖**: E2E 测试 OCR/upload 流程需要 MinerU 服务在 localhost:8010 运行
4. **Volcengine 速率限制**: 并行多 Agent 同时调用 LLM 可能触发 API 限流
5. **Scope creep**: 77 个端点全测容易失控，需严格分批 + 时间框约束

## Scope Guard

**本次不做**:
- BM25 混合检索
- Query Expansion
- 更换向量数据库（ChromaDB → Milvus/Qdrant）
- 前端测试
- 性能基准测试

### API 端点分类（按测试复杂度）

| 类别 | 端点数 | 说明 |
|------|--------|------|
| **纯 CRUD** | ~30 | Projects, Papers, Keywords, Conversations, Subscriptions, Tasks |
| **LLM 依赖** | ~15 | Chat, RAG query, Writing, Dedup verify/resolve, Keyword expand, Rewrite, Completion |
| **管线/异步** | ~10 | Pipelines (search/upload), Crawler, OCR, RAG index |
| **配置/状态** | ~7 | Settings, Health, Search sources |
| **文件 I/O** | ~5 | PDF upload/serve, OCR process |
