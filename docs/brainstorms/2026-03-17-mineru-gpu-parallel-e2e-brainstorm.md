---
date: 2026-03-17
topic: mineru-gpu-parallel-e2e-testing
---

# MinerU 启用 + GPU 多卡并行 + 全面 E2E 测试

## What We're Building

三阶段优化：

1. **启动 MinerU 服务并验证 PDF 解析质量** — MinerU v2.7.6 已安装在 conda `mineru` 环境中，但从未在测试中使用过。需要启动服务、确认 API 兼容性、并与 pdfplumber 进行解析质量对比。

2. **PDF 处理并行化 + GPU 多卡分配** — 当前论文处理是串行 `for` 循环，三块 GPU (5,6,7) 只有第一块在工作。需要实现并行 OCR/MinerU 处理，并让 Embedding、Reranker、OCR 自由分配到可用 GPU 上。同时保持对单 GPU 和纯 CPU 环境的兼容。

3. **全面 E2E 测试** — 冒烟测试（核心流程）+ 压力测试（8 篇 PDF 并发上传+查询）+ MinerU vs pdfplumber 解析质量对比。

## Why This Approach

### 现状问题

| 问题 | 影响 |
|------|------|
| MinerU 零测试覆盖 | 无法验证主力 PDF 解析器是否正常工作 |
| 串行处理 8 篇 PDF | GPU 利用率 < 5%，用户等待时间线性增长 |
| 三块 GPU 只用一块 | 2/3 的 GPU 资源浪费 |
| 所有模型挤一张卡 | Embedding(0.6B) + Reranker(0.6B) + PaddleOCR 可能 OOM |
| E2E 测试未覆盖 MinerU 路径 | pdfplumber 回退掩盖了真实环境行为 |

### 选择此方案的原因

- **MinerU 优先**：它是主力解析器（`pdf_parser=mineru`），不测它等于不测真实环境
- **仅并行化 OCR**：OCR/MinerU 是处理瓶颈（每篇 PDF 数十秒），Embedding 索引本身是批量操作
- **GPU 自由分配**：比手动指定更灵活，让 PyTorch 的 CUDA 内存管理自动处理

## Key Decisions

- **MinerU 启动端口**: 8010（与 `config.py` 中 `mineru_api_url` 默认值一致）
- **MinerU 后端模式**: `pipeline`（通用性强，支持多语言，无幻觉）
- **并行度控制**: 通过 `asyncio.Semaphore` 限制并发 OCR 数量（默认=可用 GPU 数量或 3）
- **GPU 分配策略**: `CUDA_VISIBLE_DEVICES` 环境变量 + 轮转分配（round-robin），兼容单 GPU 和 CPU
- **MinerU 并发**: MinerU 服务自带 `_request_semaphore` 控制并发
- **测试分层**: 冒烟（基本流程）→ 压力（并发）→ 质量（MinerU vs pdfplumber）
- **知识沉淀**: MinerU 启动方式写入项目 README/docs

## Resolved Questions

- **MinerU conda 环境名**: `mineru`
- **MinerU 版本**: 2.7.6
- **MinerU 启动命令**: `conda run -n mineru python -m mineru.cli.fast_api --host 0.0.0.0 --port 8010`
- **MinerU API 端点**: `POST /file_parse`（与 `mineru_client.py` 匹配）
- **优先级**: MinerU → GPU 并行 → 全面测试（按顺序）
- **并行范围**: 仅 PDF 解析/OCR 并行（它是瓶颈）
- **GPU 分配**: 三张卡都可用，并行任务自由分配，同时兼容单 GPU 和纯 CPU
- **成功标准**: 所有 E2E 测试通过，包括 MinerU 路径

## Architectural Notes

### MinerU 服务启动

```bash
# 在 conda mineru 环境中启动 MinerU FastAPI 服务
conda run -n mineru python -m mineru.cli.fast_api --host 0.0.0.0 --port 8010

# MinerU 默认使用 pipeline 后端，可通过请求参数覆盖
# 支持 GPU 加速（自动检测）
```

### GPU 轮转分配方案

```
GPU 5: Embedding (常驻) + OCR Worker 1
GPU 6: Reranker (按需加载) + OCR Worker 2
GPU 7: OCR Worker 3
```

但实际实现时用 `CUDA_VISIBLE_DEVICES=5,6,7` + 轮转：
- Worker 0 → device 0 (实际 GPU 5)
- Worker 1 → device 1 (实际 GPU 6)
- Worker 2 → device 2 (实际 GPU 7)

### 并行 OCR 架构

```
paper_processor.py:
  before: for paper in papers: await ocr(paper)  # 串行
  after:  await asyncio.gather(*[ocr(paper, gpu_id=i%n) for i, paper in enumerate(papers)])  # 并行
```

## Scope Guard

**不做**：
- 不改 MinerU 服务本身的代码
- 不做 Embedding 模型的多 GPU 分布式推理（tensor parallel）
- 不做 RAG 索引的并行化（ChromaDB 本身是单线程写入）
- 不做前端改动

## Next Steps

→ `/ce-plan` 生成实施计划
