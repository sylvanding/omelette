---
title: Blocking Sync Calls in Async Endpoints — Wrap with asyncio.to_thread
date: 2026-03-11
category: performance-issues
tags:
  - asyncio
  - fastapi
  - llama-index
  - paddleocr
  - event-loop
components:
  - backend/app/services/rag_service.py
  - backend/app/pipelines/nodes.py
severity: high
---

# 异步端点中的阻塞同步调用 — 使用 asyncio.to_thread 包装

## 问题描述

以下同步调用在 async 端点/节点中直接执行，阻塞了事件循环：

- LlamaIndex `retriever.retrieve(question)` — 向量检索
- LlamaIndex `index.insert_nodes(nodes)` — 向量索引写入
- PaddleOCR `ocr.process_pdf(path)` — CPU 密集型 PDF 解析

症状：高负载下响应缓慢、超时、并发能力下降。无显式错误，但性能严重退化。

## 根因

LlamaIndex 和 PaddleOCR 只暴露同步 API。直接在 async FastAPI 端点和 LangGraph 节点中调用这些 API，会阻塞 asyncio 事件循环中的唯一线程，所有其他协程在此期间无法执行。

## 解决方案

### RAG 服务

```python
import asyncio

# 检索 — 同步调用移到线程池
retrieved_nodes = await asyncio.to_thread(retriever.retrieve, question)

# 索引 — 同步调用移到线程池
await asyncio.to_thread(index.insert_nodes, nodes)
```

### Pipeline OCR 节点

```python
import asyncio

result = await asyncio.to_thread(ocr.process_pdf, paper.pdf_path)
```

### 核心原则

`asyncio.to_thread()` 将同步函数调度到默认的线程池执行器中运行，不阻塞事件循环。适用于：

- 所有 I/O 密集型同步调用（文件读写、网络请求）
- CPU 密集型操作（PDF 解析、文本处理）
- 第三方库不提供 async API 的场景

## 预防策略

- 审计所有 async 端点中对第三方库的直接同步调用
- 使用 `asyncio.to_thread()` 包装同步 I/O 或 CPU 密集型调用
- 优先选择 async 原生库（如 `httpx` 替代 `requests`）
- 在代码审查 checklist 中加入 "async 上下文中的同步调用" 检查项
- 在后端开发规范中记录此模式
