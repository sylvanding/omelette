---
title: "feat: GPU 资源调度模式化配置"
type: feat
status: active
date: 2026-03-18
origin: docs/brainstorms/2026-03-18-gpu-scheduling-modes-brainstorm.md
---

# GPU 资源调度模式化配置

## Overview

为 Omelette 后端引入 `GPU_MODE` 全局预设 + 按服务细粒度覆盖的 GPU 资源调度系统。三档预设（conservative / balanced / aggressive）一键控制所有 GPU 相关参数，同时允许用户通过 `.env` 按需覆盖任意参数。

## Problem Statement

当前 GPU 参数分散在多个服务中，部分硬编码（embed_batch_size=8、reranker top_n=50），无法适配不同显存环境：
- 双卡 32G 环境下默认值可能 OOM
- 大显存环境下默认值太保守，吞吐量不足
- 用户需要手动定位并修改多处代码才能调整参数

## Proposed Solution

（see brainstorm: `docs/brainstorms/2026-03-18-gpu-scheduling-modes-brainstorm.md`）

1. 新增 `GPU_MODE` 配置项，三档预设自动填充所有 GPU 相关参数
2. 新增 6 个细粒度配置项，用户可按需覆盖预设
3. GPU 固定 pin 功能：允许将 Embedding/Reranker/OCR 固定到指定 GPU
4. 优先级：用户显式设置 > GPU_MODE 预设 > 硬编码默认值

## Technical Approach

### Phase 1: 配置层（config.py）

- [ ] 1.1 定义 `GpuMode` 枚举（conservative / balanced / aggressive）
- [ ] 1.2 新增配置项到 `Settings` 类：

```python
# backend/app/config.py
class GpuMode(str, Enum):
    CONSERVATIVE = "conservative"
    BALANCED = "balanced"
    AGGRESSIVE = "aggressive"

# 新增字段
gpu_mode: GpuMode = Field(default=GpuMode.BALANCED)
embed_batch_size: int = Field(default=0, ge=0, le=128, description="0=follow GPU_MODE")
rerank_batch_size: int = Field(default=0, ge=0, le=128, description="0=follow GPU_MODE")
embed_gpu_id: int = Field(default=-1, ge=-1, le=15, description="-1=auto select")
rerank_gpu_id: int = Field(default=-1, ge=-1, le=15, description="-1=auto select")
ocr_gpu_ids: str = Field(default="", description="Comma-separated GPU IDs for OCR, empty=all")
```

- [ ] 1.3 实现 `resolve_gpu_param()` 辅助函数：

```python
# backend/app/config.py

GPU_MODE_PRESETS = {
    GpuMode.CONSERVATIVE: {
        "ocr_parallel_limit": 1,
        "embed_batch_size": 1,
        "rerank_batch_size": 1,
        "reranker_concurrency_limit": 1,
    },
    GpuMode.BALANCED: {
        "ocr_parallel_limit": 0,  # auto
        "embed_batch_size": 8,
        "rerank_batch_size": 16,
        "reranker_concurrency_limit": 1,
    },
    GpuMode.AGGRESSIVE: {
        "ocr_parallel_limit": 0,  # auto * 2 handled in resolver
        "embed_batch_size": 32,
        "rerank_batch_size": 50,
        "reranker_concurrency_limit": 2,
    },
}
```

- [ ] 1.4 实现 `model_post_init` 或 `@model_validator` 在配置加载后解析参数：当 `embed_batch_size == 0` 时从预设填充

### Phase 2: 服务层适配

- [ ] 2.1 **embedding_service.py**：
  - `_build_local_embedding` 读取 `settings.embed_batch_size`（已解析）替代硬编码
  - `_pick_best_gpu` 在 `settings.embed_gpu_id >= 0` 时短路返回 `cuda:N`

- [ ] 2.2 **reranker_service.py**：
  - `_load_reranker` 读取 `settings.rerank_batch_size` 替代硬编码 `top_n=50`
  - GPU 选择同样支持 `settings.rerank_gpu_id` pin

- [ ] 2.3 **paper_processor.py**：
  - OCR GPU 轮转范围支持 `settings.ocr_gpu_ids` 限制
  - `_resolve_parallel_limit` 在 aggressive 模式下倍增

### Phase 3: 配置文件更新

- [ ] 3.1 更新 `.env.example`：新增所有配置项及注释说明
- [ ] 3.2 更新 `.env`：设置 `GPU_MODE=conservative`（当前调试阶段）

### Phase 4: 测试

- [ ] 4.1 单元测试：`test_gpu_mode_config.py`
  - 三种模式的参数解析正确性
  - 用户覆盖优先于模式预设
  - 边界值（gpu_id=-1, batch_size=0）
- [ ] 4.2 集成测试：验证各服务读取解析后的配置
- [ ] 4.3 E2E 测试：`CUDA_VISIBLE_DEVICES=6,7 GPU_MODE=conservative` 下全套 E2E 通过

### Phase 5: 收尾

- [ ] 5.1 ruff lint + format
- [ ] 5.2 回归测试（394+ tests）
- [ ] 5.3 提交代码

## Acceptance Criteria

- [ ] `GPU_MODE=conservative` 时 `CUDA_VISIBLE_DEVICES=6,7` 全套 E2E 不 OOM
- [ ] `GPU_MODE=balanced` 时行为与当前默认一致（向后兼容）
- [ ] 所有 6 个新配置项可通过 `.env` 设置
- [ ] 用户显式设置的参数优先于模式预设
- [ ] `EMBED_GPU_ID=0` 可将 embedding 固定到 cuda:0
- [ ] `OCR_GPU_IDS=1` 可限制 OCR 只用 cuda:1
- [ ] 394+ 单元测试不回归
- [ ] 新增 ≥ 10 个配置解析单元测试

## System-Wide Impact

- **Interaction graph**: config.py 解析 → embedding_service / reranker_service / paper_processor 读取
- **Error propagation**: 无效的 gpu_id 应在配置加载时报错（Pydantic validation），不会传播到运行时
- **State lifecycle risks**: 无状态变更，纯配置层改动
- **API surface parity**: 无新 API，仅 `.env` 配置变更

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-03-18-gpu-scheduling-modes-brainstorm.md](docs/brainstorms/2026-03-18-gpu-scheduling-modes-brainstorm.md)
  - Key decisions: 三档预设 + 按服务覆盖, 默认 balanced, .env 为主无运行时切换

### Internal References

- `backend/app/config.py` — 现有 GPU 配置
- `backend/app/services/embedding_service.py:154` — 硬编码 embed_batch_size=8
- `backend/app/services/reranker_service.py:42` — 硬编码 top_n=50
- `backend/app/services/paper_processor.py` — OCR 并行和 GPU 轮转逻辑
