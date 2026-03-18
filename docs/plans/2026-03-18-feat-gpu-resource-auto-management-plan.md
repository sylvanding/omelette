---
title: "feat(backend): GPU 资源自动管理 + MinerU 子进程自治"
type: feat
status: completed
date: 2026-03-18
origin: docs/brainstorms/2026-03-18-gpu-resource-auto-management-brainstorm.md
---

# GPU 资源自动管理 + MinerU 子进程自治

## Overview

当前 Omelette 后端 GPU 模型（Embedding、Reranker、PaddleOCR）加载后永不释放，MinerU 需要手动启动/停止。
本计划实现三个改进：

1. **GPU 模型 TTL 自动卸载** — 空闲 5 分钟后自动释放显存
2. **MinerU 子进程自动管理** — 按需启动/空闲 10 分钟后自动停止
3. **GPU 监控 API** — 查看模型状态、显存占用、手动卸载

## Problem Statement

实际观察（`nvidia-smi`）：

| PID | GPU | 显存 | 来源 |
|-----|-----|------|------|
| 3808494 | GPU 6 | 2712 MiB | MinerU 外部进程 |
| 848294 | GPU 6 | 500 MiB | Embedding 模型 |
| 848294 | GPU 7 | 20714 MiB | PaddleOCR + Reranker + CUDA context |

根因：
- `embedding_service.py` 全局 `_cached_embed_model` 永不释放
- `reranker_service.py` `@lru_cache(maxsize=1)` 永不清除
- `ocr_service.py` PaddleOCR 实例无 `close()`、无 `torch.cuda.empty_cache()`
- MinerU 是外部手动进程，无自治能力

## Technical Considerations

### Key Decisions (see brainstorm: docs/brainstorms/2026-03-18-gpu-resource-auto-management-brainstorm.md)

| 决策 | 选择 | 理由 |
|------|------|------|
| GPU 模型释放策略 | TTL 5 分钟自动释放 | 平衡首次加载延迟（3-5s）和资源节约 |
| MinerU 管理方式 | 子进程 (`subprocess.Popen`) | 不依赖 Docker，使用已有 conda env |
| MinerU TTL | 10 分钟 | 启动慢（30-60s），应保持更久 |
| MinerU conda env | 独立 `mineru` 环境 | 与 omelette 环境隔离，避免依赖冲突 |
| PaddleOCR 处理 | 实例销毁时显式 `torch.cuda.empty_cache()` | 当前无清理机制 |
| 并发加载保护 | `asyncio.Lock` per model | 单用户系统，防重复加载即可 |
| 向后兼容 | 可通过配置禁用 | `model_ttl_seconds=0` 禁用 TTL, `mineru_auto_manage=False` 禁用自动管理 |

### Architecture

```
┌─────────────────────────────────────────────────────┐
│                    main.py lifespan                  │
│  startup:  gpu_model_manager.start()                │
│            mineru_process_manager.start()            │
│  shutdown: gpu_model_manager.stop()                  │
│            mineru_process_manager.stop()              │
└──────────────┬──────────────────────┬───────────────┘
               │                      │
    ┌──────────▼──────────┐  ┌───────▼────────────────┐
    │  GPUModelManager    │  │  MinerUProcessManager   │
    │                     │  │                         │
    │  _models: dict      │  │  _process: Popen | None │
    │  _locks: dict       │  │  _lock: asyncio.Lock    │
    │  _cleanup_task      │  │  _cleanup_task          │
    │                     │  │                         │
    │  acquire(name) →    │  │  ensure_running() →     │
    │    load + touch TTL │  │    start if needed      │
    │  release(name) →    │  │  touch() →              │
    │    touch TTL        │  │    update last_used     │
    │  unload_all()       │  │  stop()                 │
    │  get_status()       │  │  get_status()           │
    └──────────┬──────────┘  └───────┬────────────────┘
               │                      │
    ┌──────────▼──────────┐  ┌───────▼────────────────┐
    │  embedding_service  │  │  mineru_client          │
    │  reranker_service   │  │  ocr_service            │
    │  ocr_service        │  │                         │
    └─────────────────────┘  └────────────────────────┘
```

### Implementation Phases

#### Phase 1: GPUModelManager 核心 + config 配置

**新增文件**: `backend/app/services/gpu_model_manager.py`

**任务**:
- [ ] 在 `config.py` 新增 TTL 配置字段：`model_ttl_seconds`（默认 300）、`model_ttl_check_interval`（默认 30）
- [ ] 创建 `GPUModelManager` 类，管理模型生命周期
  - `_models: dict[str, ModelEntry]` 存储模型名 → (model, last_used_at, loader_fn)
  - `_locks: dict[str, asyncio.Lock]` 每个模型一把锁
  - `start()` 启动后台清理任务
  - `stop()` 停止清理任务，卸载所有模型
  - `acquire(name, loader_fn)` 获取模型（按需加载 + 更新 TTL）
  - `_cleanup_loop()` 定期检查并卸载超时模型
  - `_unload(name)` 卸载单个模型：`del model` + `gc.collect()` + `torch.cuda.empty_cache()`
  - `unload_all()` 卸载所有模型
  - `get_status()` 返回每个模型的加载状态
- [ ] `model_ttl_seconds=0` 时禁用 TTL（模型永不自动卸载，保持现有行为）

**预估**: ~150 行代码

#### Phase 2: 改造 embedding_service + reranker_service

**修改文件**:
- `backend/app/services/embedding_service.py`
- `backend/app/services/reranker_service.py`

**任务**:
- [ ] `embedding_service.py`: 移除全局 `_cached_embed_model`，改为通过 `GPUModelManager.acquire("embedding", _build_local_embedding)` 获取模型
- [ ] `reranker_service.py`: 移除 `@lru_cache`，改为通过 `GPUModelManager.acquire("reranker", _load_reranker_fn)` 获取模型
- [ ] 保持 `get_embedding_model()` 和 `get_reranker()` 的公共 API 不变，调用方无需修改
- [ ] `force_reload` 参数保持有效：通过 `GPUModelManager._unload` + 重新 `acquire` 实现

**关键约束**: `GPUModelManager` 必须是全局单例，通过 `main.py lifespan` 初始化

#### Phase 3: OCRService 显存清理

**修改文件**: `backend/app/services/ocr_service.py`

**任务**:
- [ ] 为 `OCRService` 添加 `close()` 方法，显式释放 PaddleOCR 实例并调用 `torch.cuda.empty_cache()`
- [ ] 为 `OCRService` 添加 `__del__()` 作为安全网，调用 `close()`
- [ ] 在所有创建 `OCRService` 实例的地方确保使用后调用 `close()` 或使用 context manager
- [ ] `ocr_service.py`: 添加 `__enter__` / `__exit__` 支持 `with` 语句

**修改调用方**:
- `paper_processor.py`: OCR 完成后调用 `close()`
- `pipelines/nodes.py`: OCR 节点完成后调用 `close()`
- `pipeline_service.py`: OCR 完成后调用 `close()`
- `api/v1/ocr.py`: API 处理完成后调用 `close()`

#### Phase 4: MinerUProcessManager

**新增文件**: `backend/app/services/mineru_process_manager.py`

**任务**:
- [ ] 在 `config.py` 新增配置字段：
  - `mineru_auto_manage: bool = True`
  - `mineru_conda_env: str = "mineru"`
  - `mineru_ttl_seconds: int = 600`
  - `mineru_startup_timeout: int = 120`
  - `mineru_gpu_ids: str = ""`
- [ ] 创建 `MinerUProcessManager` 类：
  - `_process: subprocess.Popen | None`
  - `_lock: asyncio.Lock`
  - `_last_used_at: float`
  - `start()` 启动后台 TTL 检查任务
  - `stop()` 停止清理任务，终止 MinerU 子进程
  - `ensure_running()` 确保 MinerU 正在运行：
    1. 检查端口是否已被外部进程占用 → 使用已有进程
    2. 否则启动子进程：`conda run -n {env} python -m mineru.cli.fast_api --host 0.0.0.0 --port {port}`
    3. 设置 `CUDA_VISIBLE_DEVICES` 环境变量
    4. 轮询 health check 直到可用（超时 120s）
  - `touch()` 更新 `_last_used_at`
  - `_cleanup_loop()` 定期检查是否超时
  - `_kill_process()` 安全终止：`terminate()` → `wait(10)` → `kill()`
  - `get_status()` 返回进程状态
- [ ] `mineru_auto_manage=False` 时全部跳过，保持现有行为
- [ ] 失败 fallback：启动失败时记录 warning，自动 fallback 到 pdfplumber

**预估**: ~180 行代码

#### Phase 5: 集成到 OCRService + MinerUClient

**修改文件**:
- `backend/app/services/ocr_service.py`
- `backend/app/services/mineru_client.py`

**任务**:
- [ ] `ocr_service.py` `_extract_with_mineru()`: 调用前先 `await mineru_manager.ensure_running()`，调用后 `mineru_manager.touch()`
- [ ] `mineru_client.py`: 移除 `health_check()` 中的硬编码 5s timeout，使用 `settings` 值
- [ ] 确保 `mineru_auto_manage=False` 时走原有流程（直接 health_check → 失败则跳过）

#### Phase 6: Lifespan 集成

**修改文件**: `backend/app/main.py`

**任务**:
- [ ] 导入 `GPUModelManager` 和 `MinerUProcessManager` 单例
- [ ] `lifespan` startup: 调用 `gpu_model_manager.start()` 和 `mineru_process_manager.start()`
- [ ] `lifespan` shutdown: 调用 `gpu_model_manager.stop()` 和 `mineru_process_manager.stop()`
- [ ] shutdown 时确保：卸载所有 GPU 模型 → 停止 MinerU 子进程 → 日志记录

#### Phase 7: GPU 监控 API

**新增文件**: `backend/app/api/v1/gpu.py`

**任务**:
- [ ] `GET /api/v1/gpu/status` — 返回：
  - 已加载模型列表（名称、模型名、设备、最后使用时间、TTL 剩余秒数）
  - MinerU 状态（running/stopped/external、PID、端口、TTL 剩余）
  - GPU 显存信息（通过 `torch.cuda.mem_get_info()` 获取）
- [ ] `POST /api/v1/gpu/unload` — 立即卸载所有模型并释放显存
- [ ] 在 `api/v1/__init__.py` 注册 `gpu.router`

**响应 schema**:

```python
class ModelStatus(BaseModel):
    name: str
    model_name: str
    loaded: bool
    device: str | None
    last_used_at: datetime | None
    ttl_remaining_seconds: int | None

class MinerUStatus(BaseModel):
    status: Literal["running", "stopped", "external"]
    pid: int | None
    port: int
    last_used_at: datetime | None
    ttl_remaining_seconds: int | None

class GpuMemory(BaseModel):
    gpu_id: int
    total_mb: int
    used_mb: int
    free_mb: int

class GpuStatusResponse(BaseModel):
    models: list[ModelStatus]
    mineru: MinerUStatus
    gpu_memory: list[GpuMemory]
```

#### Phase 8: 测试

**新增文件**:
- `backend/tests/test_gpu_model_manager.py`
- `backend/tests/test_mineru_process_manager.py`
- `backend/tests/test_gpu_api.py`

**GPUModelManager 测试**:
- [ ] `test_acquire_loads_model` — 首次获取触发 loader_fn
- [ ] `test_acquire_returns_cached` — 第二次获取返回缓存模型
- [ ] `test_ttl_expires_unloads` — TTL 过期后模型被卸载（mock 时间）
- [ ] `test_acquire_resets_ttl` — 使用后 TTL 重置
- [ ] `test_unload_all` — 手动卸载所有模型
- [ ] `test_concurrent_acquire_single_load` — 并发 acquire 只加载一次
- [ ] `test_ttl_zero_disables_cleanup` — `model_ttl_seconds=0` 禁用 TTL
- [ ] `test_get_status` — 状态返回正确

**MinerUProcessManager 测试**:
- [ ] `test_ensure_running_starts_subprocess` — 第一次调用启动子进程
- [ ] `test_ensure_running_reuses_existing` — 已运行时不重启
- [ ] `test_ttl_expires_stops_process` — TTL 过期后停止子进程
- [ ] `test_ensure_running_detects_external` — 检测到已有外部进程时使用它
- [ ] `test_start_failure_logs_warning` — 启动失败不抛异常，只记录 warning
- [ ] `test_auto_manage_false_skips` — `mineru_auto_manage=False` 时跳过
- [ ] `test_stop_kills_subprocess` — stop() 终止子进程

**GPU API 测试**:
- [ ] `test_gpu_status_no_models` — 无模型时返回空列表
- [ ] `test_gpu_status_with_models` — 有模型时返回正确信息
- [ ] `test_gpu_unload` — POST 调用后所有模型被卸载
- [ ] `test_gpu_status_mineru_stopped` — MinerU 停止时返回 "stopped"
- [ ] `test_gpu_status_mineru_running` — MinerU 运行时返回 "running"

**已有测试适配**:
- [ ] `test_embedding.py`: 适配新的模型获取方式
- [ ] `test_reranker_service.py`: 适配移除 `lru_cache` 后的行为
- [ ] `test_ocr.py`: 适配 `close()` 方法

## System-Wide Impact

### Interaction Graph

1. API 请求 → `RAGService.search()` → `get_embedding_model()` → `GPUModelManager.acquire("embedding")` → 加载或返回缓存 → 更新 TTL
2. API 请求 → `rerank_nodes()` → `get_reranker()` → `GPUModelManager.acquire("reranker")` → 加载或返回缓存 → 更新 TTL
3. API 请求 → `OCRService.process_pdf_async()` → `_extract_with_mineru()` → `MinerUProcessManager.ensure_running()` → 启动或复用 MinerU → `MinerUClient.parse_pdf()` → 更新 TTL
4. 后台清理任务 → `_cleanup_loop()` → 每 30 秒检查 → TTL 过期 → `_unload()` 释放显存
5. `lifespan` shutdown → `gpu_model_manager.stop()` → 卸载所有模型 → `mineru_process_manager.stop()` → 终止 MinerU

### Error & Failure Propagation

| 场景 | 处理 |
|------|------|
| 模型加载失败（OOM） | `acquire()` 抛出异常，由调用方（service 层）处理 |
| 清理任务异常 | `_cleanup_loop()` 内部 catch，记录 error，继续运行 |
| MinerU 启动超时 | `ensure_running()` 记录 warning，返回 False，fallback 到 pdfplumber |
| MinerU 进程意外退出 | 下次 `ensure_running()` 检测到进程已退出，重新启动 |
| `torch.cuda.empty_cache()` 失败 | catch 异常，记录 warning，继续 |
| shutdown 时模型卸载失败 | 记录 error，继续 shutdown 其他组件 |

### State Lifecycle Risks

| 风险 | 缓解措施 |
|------|---------|
| 模型正在使用时被 TTL 卸载 | `acquire()` 返回模型引用，即使 manager 卸载了缓存，已持有的引用仍有效；下次 `acquire` 重新加载 |
| 并发 `acquire` + `_unload` 竞态 | 每个模型一把 `asyncio.Lock`，`acquire` 和 `_unload` 都需持锁 |
| MinerU 进程残留（shutdown 失败） | `_kill_process()` 先 `terminate()`，超时后 `kill()`；`atexit` 注册最后防线 |
| PaddleOCR 显存泄漏 | `OCRService.close()` 显式 `del self._paddle_ocr` + `torch.cuda.empty_cache()` |

## Acceptance Criteria

### Functional Requirements

- [ ] GPU 模型（Embedding、Reranker）在无 API 调用 5 分钟后自动从显存中卸载
- [ ] MinerU 在需要时自动启动，空闲 10 分钟后自动停止
- [ ] `GET /api/v1/gpu/status` 返回正确的模型状态和显存信息
- [ ] `POST /api/v1/gpu/unload` 立即卸载所有模型
- [ ] `model_ttl_seconds=0` 禁用自动卸载（向后兼容）
- [ ] `mineru_auto_manage=False` 禁用 MinerU 自动管理（向后兼容）
- [ ] 应用退出时所有 GPU 模型被卸载、MinerU 子进程被终止

### Non-Functional Requirements

- [ ] TTL 检查间隔 30 秒，对 event loop 性能影响可忽略
- [ ] 模型重新加载延迟：Embedding ~3-5s, Reranker ~3-5s
- [ ] MinerU 冷启动延迟 ~30-60s（首次请求可能感知延迟）
- [ ] 无 API 调用时 GPU 显存占用接近 0

### Quality Gates

- [ ] 所有新代码通过 `ruff check` + `ruff format`
- [ ] 新增 ≥ 20 个单元测试
- [ ] 已有测试全部通过（~498 个）
- [ ] 手动验证：启动 → API 调用 → 等待 TTL → 确认 `nvidia-smi` 显存释放

## Dependencies & Prerequisites

- Python `asyncio` — 后台任务管理
- `subprocess.Popen` — MinerU 进程管理
- `torch.cuda` — 显存查询和清理（可选依赖，无 torch 时降级）
- `conda` CLI — MinerU 环境管理（需要 conda 安装且 `mineru` 环境存在）

## Risk Analysis & Mitigation

| 风险 | 可能性 | 影响 | 缓解 |
|------|--------|------|------|
| TTL 过短导致频繁重新加载 | 中 | 性能下降 | 默认 5 分钟，可配置 `model_ttl_seconds` |
| MinerU 子进程启动失败 | 低 | PDF 解析降级 | fallback 到 pdfplumber，记录 warning |
| 并发请求在模型卸载后重新加载延迟 | 低 | 首次请求延迟 3-5s | 使用 Lock 确保只加载一次 |
| CUDA context 即使 `empty_cache` 后仍占用少量显存 | 中 | ~100-200 MiB 残留 | 可接受，相比现状（20 GB）大幅改善 |

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-03-18-gpu-resource-auto-management-brainstorm.md](docs/brainstorms/2026-03-18-gpu-resource-auto-management-brainstorm.md)
  - 关键决策：TTL 5 分钟、MinerU 子进程管理、独立 conda 环境

### Internal References

- `backend/app/services/embedding_service.py` — 全局 `_cached_embed_model` 和 `_cleanup_gpu_memory()`
- `backend/app/services/reranker_service.py` — `@lru_cache(maxsize=1)` 和 `_load_reranker()`
- `backend/app/services/ocr_service.py` — PaddleOCR 实例缓存
- `backend/app/services/mineru_client.py` — MinerU HTTP 客户端
- `backend/app/config.py:152-159` — 现有 GPU 配置
- `backend/app/main.py:25-33` — 现有 lifespan（仅 init_db）
- `docs/solutions/deployment/mineru-setup-guide.md` — MinerU 部署指南
