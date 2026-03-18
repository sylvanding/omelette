---
title: MinerU PDF 解析服务部署指南
category: deployment
tags: [mineru, ocr, pdf, gpu]
created: 2026-03-17
---

# MinerU PDF 解析服务部署指南

MinerU 是 Omelette 的高质量 PDF 解析引擎，支持公式、表格和图片识别，输出结构化 Markdown。

## 环境安装

MinerU 运行在独立的 conda 环境中，避免与 Omelette 主环境的依赖冲突。

```bash
# 创建 conda 环境（Python 3.10，MinerU 官方推荐）
conda create -n mineru python=3.10 -y
conda activate mineru

# 安装 MinerU
pip install "mineru[full]>=2.7"
```

## 启动服务

```bash
# 指定可用 GPU 并启动 FastAPI 服务
CUDA_VISIBLE_DEVICES=5,6,7 conda run -n mineru python -m mineru.cli.fast_api \
    --host 0.0.0.0 --port 8010
```

首次启动会自动下载模型（约 2-3 GB），需要等待数分钟。后续启动仅加载已缓存的模型。

### 验证服务状态

```bash
# 检查 Swagger 文档页面
curl -s -o /dev/null -w "%{http_code}" http://localhost:8010/docs
# 预期输出：200

# 测试 PDF 解析
curl -X POST http://localhost:8010/file_parse \
  -F "files=@/path/to/test.pdf" \
  -F "backend=pipeline" \
  -F "return_md=true" \
  -F "formula_enable=true" \
  -F "table_enable=true"
```

### 使用 systemd 管理（生产环境）

```ini
# /etc/systemd/system/mineru.service
[Unit]
Description=MinerU PDF Parsing Service
After=network.target

[Service]
Type=simple
User=djx
Environment=CUDA_VISIBLE_DEVICES=5,6,7
ExecStart=/path/to/conda/envs/mineru/bin/python -m mineru.cli.fast_api --host 0.0.0.0 --port 8010
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

## 后端配置对接

在 `.env` 中配置以下参数：

```bash
# 解析器选择：mineru | pdfplumber | auto
PDF_PARSER=mineru

# MinerU 服务地址
MINERU_API_URL=http://localhost:8010

# 解析后端：pipeline（推荐）| hybrid-auto-engine | vlm-auto-engine
MINERU_BACKEND=pipeline

# 单个 PDF 解析超时（秒），大文件建议设大
MINERU_TIMEOUT=8000
```

### 配置项说明

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `PDF_PARSER` | `mineru` | 解析引擎选择。`mineru` 优先使用 MinerU，不可用时回退到 pdfplumber |
| `MINERU_API_URL` | `http://localhost:8010` | MinerU FastAPI 服务地址 |
| `MINERU_BACKEND` | `pipeline` | `pipeline` 最稳定；`vlm-auto-engine` 需要 VLM 模型 |
| `MINERU_TIMEOUT` | `8000` | 每个 PDF 解析的超时秒数 |

## GPU 配置

MinerU 服务端自行管理 GPU 分配。Omelette 后端通过 HTTP 调用 MinerU，不直接占用 GPU。

```bash
# MinerU 使用的 GPU（通过 CUDA_VISIBLE_DEVICES 控制）
CUDA_VISIBLE_DEVICES=5,6,7 conda run -n mineru python -m mineru.cli.fast_api --host 0.0.0.0 --port 8010
```

如需限制 MinerU 只使用特定 GPU：

```bash
# 仅使用物理 GPU 7
CUDA_VISIBLE_DEVICES=7 conda run -n mineru python -m mineru.cli.fast_api --host 0.0.0.0 --port 8010
```

## 回退机制

当 MinerU 不可用时（服务未启动/网络不通/解析失败），Omelette 自动回退：

1. **MinerU**（首选）→ 高质量 Markdown，支持公式和表格
2. **pdfplumber**（回退）→ 原生文本提取，轻量无 GPU 要求
3. **PaddleOCR**（二次回退）→ 扫描件 OCR，需 GPU

## 常见问题

### Q: 首次解析很慢？

A: MinerU 首次请求需下载和加载模型（~2GB），通常耗时 1-3 分钟。后续请求正常。

### Q: 出现 CUDA out of memory？

A: MinerU 的 pipeline 后端需要约 3-4 GB 显存。确保指定的 GPU 有足够空闲显存。

### Q: 如何切换回 pdfplumber？

A: 设置 `PDF_PARSER=pdfplumber`，无需启动 MinerU 服务。

### Q: MinerU 服务端口被占用？

A: 修改启动命令中的 `--port` 参数，并同步更新 `.env` 中的 `MINERU_API_URL`。
