# GPU 资源调度与模式化配置

**日期**: 2026-03-18
**状态**: completed

## 背景

服务器有 8 张 GPU（0-7）。当前部署：

| GPU | 用途 | 管理方式 |
|-----|------|----------|
| 5 | MinerU PDF 解析服务（独立 conda 环境） | 单独启动，常驻 |
| 6, 7 | Omelette 后端（OCR、Embedding、Reranker） | `CUDA_VISIBLE_DEVICES=6,7` |
| 0-4 | 不使用 / 其他用途 | — |

**问题**：当前 batch_size 和并发数要么硬编码，要么默认值较高，在双卡环境下容易 OOM。需要一套灵活的配置体系，既有"一键设置"的预设模式，又允许用户按需覆盖。

## What We're Building

一套 **GPU 资源调度配置系统**，包含：

1. **GPU_MODE 全局预设** — `conservative / balanced / aggressive` 三档，一键控制所有 GPU 相关参数的默认行为
2. **按服务细粒度覆盖** — 用户可通过 `.env` 单独设置任意服务的 batch_size、并发数、GPU 绑定
3. **智能 GPU 选择 + 手动 Pin** — 默认选显存最空闲的 GPU，但允许用户将 Embedding/Reranker/OCR 固定到指定 GPU

## Why This Approach

- **不用重启即知道参数是否合理** — 三种预设覆盖了"调试/日常/压满"三个典型场景
- **YAGNI** — 不做运行时 API 切换（改 .env 重启即可），不做自动 OOM 降档（复杂度高收益低）
- **向后兼容** — 不设 GPU_MODE 时行为等同 `balanced`，与现有默认值一致

## Key Decisions

### 1. 三档预设模式

| 参数 | `conservative` | `balanced`（默认） | `aggressive` |
|------|---------------|-------------------|-------------|
| `OCR_PARALLEL_LIMIT` | 1 | auto (GPU 数) | GPU 数 × 2 |
| `EMBED_BATCH_SIZE` | 1 | 8 | 32 |
| `RERANK_BATCH_SIZE` | 1 | 16 | 50 |
| `RERANKER_CONCURRENCY_LIMIT` | 1 | 1 | 2 |

- `conservative`：调试场景 / 小显存（8-16G），绝不 OOM
- `balanced`：日常使用，兼顾性能和稳定
- `aggressive`：大显存（32G+）、大批量处理，追求最大吞吐

### 2. 新增配置项

| 配置项 | 类型 | 默认 | 说明 |
|--------|------|------|------|
| `GPU_MODE` | str | `balanced` | 全局预设：conservative / balanced / aggressive |
| `EMBED_BATCH_SIZE` | int | 0（跟随模式） | Embedding 推理 batch size，0=跟随 GPU_MODE |
| `RERANK_BATCH_SIZE` | int | 0（跟随模式） | Reranker 内部 top_n，0=跟随 GPU_MODE |
| `EMBED_GPU_ID` | int | -1（自动） | Embedding 模型固定到哪张 GPU，-1=自动选择 |
| `RERANK_GPU_ID` | int | -1（自动） | Reranker 模型固定到哪张 GPU，-1=自动选择 |
| `OCR_GPU_IDS` | str | ""（自动） | OCR 使用的 GPU 列表（逗号分隔），空=全部轮转 |

### 3. 优先级规则

```
用户显式设置 > GPU_MODE 预设 > 硬编码默认值
```

示例：`GPU_MODE=conservative` + `EMBED_BATCH_SIZE=16` → Embedding 用 16，其余跟 conservative。

### 4. GPU 选择策略

- **Embedding / Reranker**：默认 `_pick_best_gpu()`（选显存最空闲的），可通过 `EMBED_GPU_ID` / `RERANK_GPU_ID` 固定
- **OCR**：默认轮转所有可见 GPU，可通过 `OCR_GPU_IDS` 限制范围（如只用 GPU 7）
- 固定 GPU 时跳过 `_pick_best_gpu()` 直接用 `cuda:N`

### 5. 不做的事

- **不做运行时 API 切换**：改 `.env` 重启即可，避免热切换带来的状态管理复杂度
- **不做自动降档**：OOM 时已有 retry + 换 GPU 机制，不再叠加自动模式切换
- **不在单 paper 内部加并发**：OCR 已经是 per-page 串行处理，PaddleOCR 内部有自己的并行优化

## Resolved Questions

**Q: "多 paper 多 batchsize" vs "单 paper 多 batchsize"？**
A: "多 paper" 由 `OCR_PARALLEL_LIMIT` 控制（同时处理几篇论文），"多 batchsize" 由各服务的 `*_BATCH_SIZE` 控制（每次推理处理多少数据）。两者正交，不需要额外模式。

**Q: MinerU 需要纳入调度吗？**
A: 不需要。MinerU 是独立 conda 环境启动的外部服务，通过 HTTP API 调用。它的 GPU 分配由启动命令的 `CUDA_VISIBLE_DEVICES` 控制，与后端隔离。

**Q: 运行时切换模式的需求？**
A: 当前阶段通过 `.env` 重启即可。未来如有需要，可以通过 Settings API 暴露，但不是现在的优先级。

## Architectural Notes

### 配置解析流程

```
启动 → 读 .env → 解析 GPU_MODE →
  对每个参数:
    if 用户显式设置了 → 用用户值
    elif GPU_MODE 有预设 → 用预设值
    else → 用硬编码默认值
```

### 实现要点

1. `config.py` 中定义 `GpuMode` 枚举和 `_resolve_gpu_param()` 辅助函数
2. 各 batch_size 字段默认 0，表示"跟随 GPU_MODE"
3. `embedding_service.py` 和 `reranker_service.py` 读取解析后的值，不再硬编码
4. `.env.example` 中用注释说明预设对应的参数值
5. `_pick_best_gpu()` 在 `*_GPU_ID >= 0` 时短路返回 `cuda:N`

### 典型使用场景

```bash
# 场景 1: 调试，双卡但想保守
GPU_MODE=conservative
CUDA_VISIBLE_DEVICES=6,7

# 场景 2: 日常（什么都不设，默认 balanced）
CUDA_VISIBLE_DEVICES=6,7

# 场景 3: 大批量处理，压满显卡
GPU_MODE=aggressive
CUDA_VISIBLE_DEVICES=6,7
OCR_PARALLEL_LIMIT=4

# 场景 4: 精细控制
GPU_MODE=balanced
EMBED_GPU_ID=0       # 固定 embedding 到 cuda:0 (物理 GPU 6)
RERANK_GPU_ID=1      # 固定 reranker 到 cuda:1 (物理 GPU 7)
EMBED_BATCH_SIZE=16   # 覆盖 balanced 默认的 8
```
