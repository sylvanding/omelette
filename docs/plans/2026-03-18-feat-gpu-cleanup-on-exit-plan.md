---
title: "feat(backend): 程序退出时 GPU 资源自动释放"
type: feat
status: active
date: 2026-03-18
origin: docs/brainstorms/2026-03-18-gpu-cleanup-on-exit-brainstorm.md
---

# 程序退出时 GPU 资源自动释放

## Overview

实现两层防护确保程序退出时释放所有 GPU 资源：
1. **进程内安全网** — atexit、signal handler、lifespan 增强
2. **外部看门狗** — 独立脚本监控主进程，退出后清理残留

## Implementation Phases

### Phase 1: 进程内安全网

#### 1.1 atexit 同步清理

**修改文件**: `backend/app/main.py`

- [ ] 注册 `atexit` 回调函数 `_sync_cleanup()`，在 Python 解释器退出前执行：
  - 调用 `gpu_model_manager.unload_all()` 释放所有 GPU 模型
  - 杀死 MinerU 子进程（如有）
  - 杀死端口 8010 上的外部 MinerU（通过 PID 查找）
- [ ] `_sync_cleanup()` 必须是**同步函数**（atexit 不支持 async）
- [ ] 在 lifespan startup 中注册 `atexit.register(_sync_cleanup)`

#### 1.2 SIGHUP 处理

**修改文件**: `backend/app/main.py`

- [ ] 注册 `signal.signal(signal.SIGHUP, _handle_sighup)` 处理终端关闭
- [ ] `_handle_sighup` 中调用 `_sync_cleanup()` 后退出
- [ ] 注意：SIGHUP 在 uvicorn 运行时可能被覆盖，需在 lifespan startup 中注册

#### 1.3 Lifespan 增强 — 杀外部 MinerU

**修改文件**: `backend/app/services/mineru_process_manager.py`

- [ ] 新增方法 `kill_external_by_port()` — 通过 `lsof -ti:{port}` 或 `ss` 查找并杀死占用 MinerU 端口的进程
- [ ] 在 `stop()` 方法中，如果 `_is_external` 为 True，也调用 `kill_external_by_port()`
- [ ] 安全检查：不杀自己的 PID

#### 1.4 PID 文件

**修改文件**: `backend/app/main.py`, `backend/app/config.py`

- [ ] `config.py`: 添加 `pid_file: str` 配置（默认 `{data_dir}/omelette.pid`）
- [ ] lifespan startup: 写入当前 PID 到文件
- [ ] lifespan shutdown / atexit: 删除 PID 文件

### Phase 2: 外部看门狗脚本

**新增文件**: `backend/scripts/gpu_watchdog.py`

- [ ] 独立 Python 脚本，不依赖 Omelette 代码
- [ ] 读取 PID 文件，监控主进程是否存活
- [ ] 主进程退出后执行清理：
  1. 查找并杀死 MinerU（通过端口）
  2. 查找并杀死其他占用 `CUDA_VISIBLE_DEVICES` 的 Python 进程（可选）
  3. 删除 PID 文件
- [ ] 支持命令行参数：`--pid-file`, `--interval`(检查间隔，默认 5s), `--mineru-port`
- [ ] 后台运行：`python scripts/gpu_watchdog.py --daemon`

### Phase 3: 集成 + 测试

- [ ] 测试 Ctrl+C 场景
- [ ] 测试 kill PID 场景
- [ ] 测试关闭终端场景
- [ ] 测试看门狗 kill -9 场景
- [ ] `ruff check` + `ruff format`

## Acceptance Criteria

- [ ] Ctrl+C 后 `nvidia-smi` 无 Omelette/MinerU 进程
- [ ] kill PID 后同上
- [ ] 关闭终端后同上
- [ ] kill -9 后看门狗 5s 内清理完毕
- [ ] 正常 TTL 功能不受影响

## Risk & Mitigation

| 风险 | 缓解措施 |
|------|---------|
| `signal.signal(SIGHUP)` 被 uvicorn 覆盖 | 在 lifespan startup 中注册（uvicorn 已完成信号设置后） |
| `lsof` 不可用 | fallback 到 `ss -tlnp` 或 `/proc/net/tcp` + `/proc/{pid}/cmdline` |
| 看门狗自身挂掉 | lifespan startup 自动启动看门狗；看门狗自带简单心跳 |
| atexit 在 SIGKILL 时不执行 | 已知限制，由看门狗覆盖 |
| 杀错进程（端口被其他服务占用） | 杀之前检查进程 cmdline 是否包含 `mineru` |

## Sources

- **Brainstorm**: [docs/brainstorms/2026-03-18-gpu-cleanup-on-exit-brainstorm.md](../brainstorms/2026-03-18-gpu-cleanup-on-exit-brainstorm.md)
