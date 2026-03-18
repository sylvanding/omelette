---
title: "GPU 资源自动管理 + MinerU 子进程自治"
date: 2026-03-18
status: approved
tags: [backend, gpu, performance, mineru, resource-management]
---

# GPU 资源自动管理 + MinerU 子进程自治

## 背景

当前 Omelette 后端存在 GPU 资源浪费问题：

1. **Embedding 模型**（Qwen3-Embedding-0.6B）：全局变量缓存，加载后永不释放，占用 ~500 MiB
2. **Reranker 模型**（Qwen3-Reranker-0.6B）：`@lru_cache(maxsize=1)` 缓存，永不清除，占用 ~500 MiB
3. **PaddleOCR**：实例级缓存，但 GPU 显存未被显式释放，占用 ~2-4 GB
4. **MinerU 服务器**：独立外部进程，需手动启动，持续占用 ~2.7 GB 显存

实际观察：GPU 6 占用 3.2 GB，GPU 7 占用 20.7 GB，即使没有 API 调用也不释放。

## 改进内容

### 1. GPU 模型 TTL 自动卸载

**策略**：模型在空闲 5 分钟（可配置 `model_ttl_seconds`）后自动卸载并释放 VRAM。

**覆盖模型**：
- **Embedding 模型**：`embedding_service.py` 全局 `_cached_embed_model`
- **Reranker 模型**：`reranker_service.py` `@lru_cache` 缓存
- **PaddleOCR**：`ocr_service.py` 实例级 `_paddle_ocr`

**机制**：
- 统一的 `GPUModelManager` 管理所有模型的生命周期
- 每个模型维护 `last_used_at` 时间戳
- 后台 `asyncio.Task` 定期检查（每 30 秒），卸载超时模型
- 卸载时调用 `del model` + `gc.collect()` + `torch.cuda.empty_cache()`
- API 调用时自动按需加载，使用后更新时间戳

**配置**：
- `model_ttl_seconds: int = 300`（默认 5 分钟）
- `model_ttl_check_interval: int = 30`（检查间隔 30 秒）

### 2. MinerU 子进程自动管理

**策略**：Omelette 在需要 MinerU 时自动启动子进程，空闲 10 分钟后自动停止。

**实现**：
- 新增 `MinerUProcessManager` 管理 MinerU 子进程生命周期
- 启动命令：`conda run -n mineru python -m mineru.cli.fast_api --host 0.0.0.0 --port <port>`
- 环境变量继承：`CUDA_VISIBLE_DEVICES` 从 omelette 配置获取
- 健康检查：启动后轮询 `/docs` 端点直到可用
- 空闲检测：与 GPU 模型 TTL 类似，使用后更新 `last_used_at`
- 停止方式：`process.terminate()` + `process.wait(timeout=10)` + `process.kill()`

**配置**：
- `mineru_auto_manage: bool = True`（默认启用自动管理）
- `mineru_conda_env: str = "mineru"`（conda 环境名）
- `mineru_ttl_seconds: int = 600`（默认 10 分钟空闲后停止）
- `mineru_startup_timeout: int = 120`（启动超时 120 秒）
- `mineru_gpu_ids: str = ""`（MinerU 使用的 GPU，空则继承 `cuda_visible_devices`）

**容错**：
- 启动失败（conda 不存在 / mineru 环境缺失 / 端口冲突）→ 自动 fallback 到 pdfplumber
- 运行中崩溃 → 下次需要时重新启动
- 日志中记录 warning 提示用户

**兼容性**：
- `mineru_auto_manage = False` 时保持现有行为（用户手动管理）
- 已运行的外部 MinerU 实例不受影响（先检查端口是否已在用）

### 3. GPU 监控 API

**端点**：`GET /api/v1/gpu/status`

**返回数据**：
```json
{
  "models": [
    {
      "name": "embedding",
      "model_name": "Qwen/Qwen3-Embedding-0.6B",
      "loaded": true,
      "device": "cuda:0",
      "last_used_at": "2026-03-18T12:00:00",
      "ttl_remaining_seconds": 180
    }
  ],
  "mineru": {
    "status": "running",
    "pid": 12345,
    "port": 8010,
    "last_used_at": "2026-03-18T12:00:00",
    "ttl_remaining_seconds": 420
  },
    "gpu_memory": [
    {"gpu_id": 6, "total_mb": 24576, "used_mb": 1024, "free_mb": 23552},
    {"gpu_id": 7, "total_mb": 24576, "used_mb": 500, "free_mb": 24076}
  ]
}
```

**附加端点**：
- `POST /api/v1/gpu/unload` — 立即卸载所有模型并释放显存

## 关键决策

- **TTL 时长**：GPU 模型 5 分钟，MinerU 10 分钟（MinerU 启动较慢）
- **MinerU 管理**：子进程方式，使用独立的 `mineru` conda 环境
- **单用户系统**：不考虑并发用户竞争 GPU 资源
- **PaddleOCR 处理**：当前已是按实例创建；改进点是在实例销毁时显式调用 `torch.cuda.empty_cache()` 确保显存释放
- **向后兼容**：所有新功能默认启用，但可通过配置禁用

## 已解决的问题

- Q: 模型卸载后重新加载要多久？
  A: Embedding ~3-5s，Reranker ~3-5s，PaddleOCR ~5-8s，MinerU ~30-60s。TTL 策略正是为了平衡这个延迟。
- Q: 多个请求同时需要同一模型怎么办？
  A: 使用 `asyncio.Lock` 确保同一模型只加载一次，后续请求等待加载完成。
- Q: MinerU 子进程的 GPU 内存如何隔离？
  A: 通过 `CUDA_VISIBLE_DEVICES` 环境变量控制，可配置 `mineru_gpu_ids` 指定专用 GPU。
