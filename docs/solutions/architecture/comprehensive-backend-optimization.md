---
title: 后端全面优化 — GPU 管理、安全、测试与代码质量
date: 2026-03-19
category: architecture
severity: high
component:
  - backend/app/main.py
  - backend/app/config.py
  - backend/app/services/gpu_model_manager.py
  - backend/app/services/mineru_process_manager.py
  - backend/app/services/url_validator.py
  - backend/app/pipelines
  - backend/scripts/gpu_watchdog.py
tags:
  - async-blocking
  - gpu-ttl
  - gpu-mode-presets
  - mineru-subprocess
  - exit-cleanup
  - ssrf-protection
  - pipeline-persistence
  - paper-unique-constraint
  - prompt-centralization
  - testing
related_issues: []
symptoms:
  - 同步 I/O（socket.getaddrinfo、subprocess.wait、fitz.open）阻塞 asyncio 事件循环
  - 服务层冗余 db.commit() 导致不必要的开销
  - 裸 except:pass 吞掉异常导致调试困难
  - GPU 模型（embedding/reranker/PaddleOCR）永久驻留 VRAM
  - MinerU 子进程退出后无人回收
  - RSS 订阅和爬虫存在 SSRF 漏洞
  - 缺少 project_id 校验导致越权访问风险
  - Paper 表缺乏 (project_id, doi) 唯一约束导致数据重复
  - Pipeline 检查点使用 MemorySaver 导致重启丢失状态
  - ResolvedConflict 缺少 new_paper 字段导致去重流水线数据丢失
root_cause: |
  迭代式特性开发积累的技术债务：缺乏统一的异步/阻塞规范、配置模式、
  资源生命周期管理。安全校验、输入校验和流水线持久化是增量添加的，
  缺少系统性审查。
resolution_type: refactor
time_to_resolve: multi-session
---

# 后端全面优化 — GPU 管理、安全、测试与代码质量

## 背景

Omelette 后端在快速迭代开发后积累了多方面的技术债务。通过系统性的代码审查，识别出 7 个核心优化领域，覆盖 136 个文件，新增/修改 ~15,000 行代码。

## 解决方案

### 1. 代码质量：异步阻塞修复

同步 I/O 调用在 `async def` 中直接执行会阻塞事件循环。所有此类调用统一用 `asyncio.to_thread()` 包装：

```python
# crawler_service.py — URL 校验（DNS 解析）
await asyncio.to_thread(validate_url_safe, url)

# mineru_process_manager.py — 子进程 I/O
stderr_data = await asyncio.to_thread(self._process.stderr.read)
await asyncio.to_thread(self._process.wait, 10)

# ocr_service.py — PDF 处理
return await asyncio.to_thread(self.process_pdf, pdf_path, force_ocr)
```

冗余 `db.commit()` 被移除（由 `get_session()` 统一管理事务）。裸 `except: pass` 替换为 `logger.warning()` + 适当重新抛出。

### 2. GPU 资源管理（新特性）

`GPUModelManager` 实现基于 TTL 的自动卸载：

```python
class GPUModelManager:
    def acquire(self, name: str, loader_fn: Callable, ...) -> Any:
        """返回缓存模型或按需加载，更新 last_used_at"""
        with lock:
            entry = self._models.get(name)
            if entry is not None:
                entry.last_used_at = time.monotonic()
                return entry.model
            # 加载并注册...

    async def _cleanup_loop(self) -> None:
        while True:
            await asyncio.sleep(self._interval)
            expired = [n for n, e in self._models.items()
                       if (now - e.last_used_at) > self._ttl]
            for name in expired:
                self.unload(name)
```

配置项：
- `MODEL_TTL_SECONDS`（默认 300）— 空闲超时自动卸载
- `GPU_MODE`（conservative/balanced/aggressive）— 批处理大小预设
- `GET /api/v1/gpu/status` / `POST /api/v1/gpu/unload` — 监控 API
- `gpu_utils.release_gpu_memory()` = `gc.collect()` + `torch.cuda.empty_cache()`

### 3. MinerU 子进程管理（新特性）

`MinerUProcessManager` 自动启动和 TTL 停止 MinerU：

```python
async def ensure_running(self) -> bool:
    """1. 外部进程在端口上 → 使用它  2. 否则通过 conda run 启动  3. 轮询 /docs 直到健康"""
    if await self._health_check():
        self._touch()
        return True
    self._start_subprocess()  # conda run -n {env} python -m mineru.cli.fast_api ...
    return await self._wait_healthy(settings.mineru_startup_timeout)
```

`kill_external_by_port()` 通过 `/proc/net/tcp` 或 `lsof` 查找并杀死占用端口的进程。

### 4. 退出清理（新特性）

多层清理机制确保各种退出场景下 GPU 资源被释放：

```python
# app/main.py
def _sync_cleanup() -> None:
    gpu_model_manager.unload_all()
    mineru_process_manager.stop_sync()
    Path(settings.pid_file).unlink(missing_ok=True)

atexit.register(_sync_cleanup)
signal.signal(signal.SIGHUP, _handle_sighup)
```

`scripts/gpu_watchdog.py` 作为外部守护进程，监控 PID 文件，在 `kill -9` 或崩溃后清理资源。

### 5. 安全增强

- **SSRF 防护**：`url_validator.py` 解析 DNS 并阻止私有/保留 IP
- **项目校验**：敏感端点添加 `Depends(get_project)`
- **类型约束**：`Literal["keep_old", "keep_new", "merge", "skip"]` 等
- **限速**：writing 端点使用 slowapi

### 6. 数据完整性

- **Paper 唯一约束**：`UniqueConstraint("project_id", "doi")` + Alembic 迁移
- **Pipeline 持久化**：`AsyncSqliteSaver` 替代 `MemorySaver`
- **ResolvedConflict 修复**：补全缺失的 `new_paper` 字段
- **Pipeline 取消模块**：提取到 `pipelines/cancellation.py` 消除反向依赖

### 7. 测试（178 → 526）

- 141 个新 API 端点测试（4 个测试文件全覆盖）
- 25 个 E2E 真实 LLM 集成测试
- GPU manager、MinerU manager、URL validator 等单元测试
- 并发压力测试

## 预防与最佳实践

### 代码审查清单

| 类别 | 检查项 |
|------|--------|
| **异步阻塞** | `async def` 中不直接调用 `socket.*`、`subprocess.*`、`fitz.open`、`feedparser.parse` |
| **事务管理** | 服务层不调用 `db.commit()`，由 `get_session()` 统一管理 |
| **异常处理** | 禁止 `except: pass`，至少 `logger.warning()` |
| **GPU 生命周期** | 通过 `GPUModelManager.acquire()` 加载，`atexit` 确保卸载 |
| **子进程** | 启动必配清理（`atexit` + 信号处理） |
| **URL 安全** | 用户提供的 URL 必须经 `validate_url_safe()` 校验 |
| **资源归属** | 项目级端点必须 `Depends(get_project)` |
| **提示词** | 集中到 `app/prompts/`，禁止服务内硬编码 |

### 推荐模式

| 场景 | 正确做法 | 避免做法 |
|------|----------|----------|
| 异步中调同步 | `await asyncio.to_thread(sync_fn, ...)` | 直接调用 `sync_fn(...)` |
| 事务提交 | `get_session()` 自动提交 | 服务内 `await db.commit()` |
| GPU 模型 | `gpu_model_manager.acquire()` + TTL | 加载后永不卸载 |
| Pipeline 状态 | `AsyncSqliteSaver` | `MemorySaver()` 用于生产 |
| LLM 提示词 | `from app.prompts.chat import CHAT_QA_SYSTEM` | 内联字符串 `"You are..."` |

## 相关文档

| 文档 | 说明 |
|------|------|
| [blocking-sync-calls-asyncio-to-thread](../performance-issues/blocking-sync-calls-asyncio-to-thread.md) | 异步阻塞模式详解 |
| [mineru-setup-guide](../deployment/mineru-setup-guide.md) | MinerU 部署指南 |
| [langgraph-hitl-interrupt-api-snapshot-next](../integration-issues/langgraph-hitl-interrupt-api-snapshot-next.md) | HITL 中断/恢复 |
| [test-database-pollution-tempfile-mkdtemp](../test-failures/test-database-pollution-tempfile-mkdtemp.md) | 测试 DB 隔离 |
| [codebase-quality-audit-4-batch-remediation](../compound-issues/codebase-quality-audit-4-batch-remediation.md) | 前次代码质量审计 |

### 设计文档

- `docs/brainstorms/2026-03-18-gpu-resource-auto-management-brainstorm.md`
- `docs/brainstorms/2026-03-18-gpu-cleanup-on-exit-brainstorm.md`
- `docs/brainstorms/2026-03-18-backend-comprehensive-review-brainstorm.md`
- `docs/plans/2026-03-18-feat-gpu-resource-auto-management-plan.md`
- `docs/plans/2026-03-18-feat-gpu-cleanup-on-exit-plan.md`
- `docs/plans/2026-03-18-refactor-backend-comprehensive-review-plan.md`
