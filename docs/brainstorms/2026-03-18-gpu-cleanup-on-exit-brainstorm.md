---
title: "程序退出时 GPU 资源自动释放"
date: 2026-03-18
status: approved
tags: [backend, gpu, resource-management, reliability]
---

# 程序退出时 GPU 资源自动释放

## 背景

当前 Omelette 后端已实现 TTL 自动释放 GPU 模型（空闲 5 分钟后卸载），但在程序退出时存在资源未释放的场景。

### 当前 GPU 状态（实测）

| 进程 | PID | GPU | 显存 | 说明 |
|------|-----|-----|------|------|
| Omelette | 2015162 | GPU 6 | 668 MiB | Embedding 模型（TTL 剩余 222s） |
| Omelette | 2015162 | GPU 7 | 2114 MiB | Reranker/CUDA context |
| MinerU | 2074601 | GPU 6 | 2872 MiB | 手动启动的外部进程 |

### 现有清理机制

lifespan shutdown (`main.py`) 在正常退出时调用 `gpu_model_manager.stop()` 和 `mineru_process_manager.stop()`。

### 退出场景覆盖分析

| 场景 | 当前是否清理 | 原因 |
|------|-------------|------|
| Ctrl+C | ✅ | uvicorn 捕获 SIGINT → lifespan shutdown |
| kill PID (SIGTERM) | ✅ | uvicorn 捕获 SIGTERM → lifespan shutdown |
| kill -9 (SIGKILL) | ❌ | 内核强杀，无法捕获 |
| 程序崩溃/OOM | ❌ | event loop 已死 |
| 关闭终端 (SIGHUP) | ❌ | uvicorn 默认不处理 SIGHUP |
| 外部 MinerU | ❌ | `external` 状态不管 |

## 我们要构建什么

**两层防护机制**，最大化覆盖所有退出场景：

### 第一层：进程内安全网（方案 A）

在 Omelette 进程内增加多层清理机制：

1. **`atexit` 注册同步清理函数** — 程序正常退出或 Python 解释器退出时调用。
   覆盖：正常退出、未捕获异常、部分崩溃场景。
   不覆盖：SIGKILL、段错误。

2. **`signal.signal(SIGHUP)` 处理关闭终端** — 终端关闭时发送 SIGHUP。
   覆盖：SSH 断开、关闭终端窗口。

3. **Lifespan shutdown 时杀外部 MinerU** — 通过查找端口对应 PID 并发送 SIGTERM。
   当前只杀自己启动的子进程，改为也杀外部 MinerU。

### 第二层：外部看门狗（方案 B）

独立脚本监控 Omelette 主进程，主进程退出后清理残留 GPU 资源：

1. **PID 文件** — Omelette 启动时写 PID 到文件
2. **看门狗脚本** — 持续监控主进程 PID：
   - 主进程存活 → 无操作
   - 主进程消失 → 执行清理（kill MinerU、释放显存）
3. 覆盖 kill -9、OOM、段错误等所有场景

## 为什么选择这个方案

- 方案 A 简单直接，覆盖 90% 场景（Ctrl+C、SIGTERM、SIGHUP、崩溃）
- 方案 B 作为最后防线，覆盖方案 A 无法处理的 kill -9 和 OOM
- 两层组合实现接近 100% 的资源释放保障

## 关键决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 清理范围 | 所有 GPU 资源 + 外部 MinerU | 关闭程序时应完全释放 |
| MinerU 外部进程处理 | 通过端口查 PID 后 kill | MinerU 无关闭 API |
| 看门狗实现 | 独立 Python 脚本 | 轻量、与主进程隔离 |
| PID 文件位置 | `{data_dir}/omelette.pid` | 与其他数据文件一致 |
| kill -9 处理 | 仅看门狗能覆盖 | 进程内无法捕获 SIGKILL |

## 已解决问题

1. ~~TTL 是否正常工作~~ → 确认正常（Embedding 空闲 77s，TTL 剩余 222s）
2. ~~外部 MinerU 如何关闭~~ → 通过端口查找 PID + SIGTERM
3. ~~kill -9 如何处理~~ → 外部看门狗
