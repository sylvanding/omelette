# MinerU 独立服务部署指南

MinerU 是 Omelette 的 PDF 深度解析引擎，通过独立 FastAPI 服务部署，与主后端通过 HTTP API 通信。

## 系统要求

| 项目 | 要求 |
|------|------|
| Python | 3.10 - 3.13 |
| GPU | 6GB+ VRAM（pipeline 后端）/ 10GB+（hybrid 后端） |
| 内存 | 16GB+，推荐 32GB |
| 磁盘 | 20GB+ SSD（含模型文件） |
| CUDA | 11.8 / 12.4 / 12.6 / 12.8 |

## 安装步骤

### 1. 创建独立 conda 环境

MinerU 的依赖与 Omelette 主后端有冲突（如 pydantic 版本），必须使用独立环境。

```bash
conda create -n mineru python=3.12 -y
conda activate mineru
```

### 2. 安装 MinerU

```bash
# 升级 pip
/path/to/miniconda3/envs/mineru/bin/pip install --upgrade pip

# 安装 mineru（v2.x 包名为 mineru，非旧版 magic-pdf）
/path/to/miniconda3/envs/mineru/bin/pip install -U "mineru[all]"
```

### 3. 下载模型

模型文件约 5-10GB（取决于选择），首次下载需要较长时间。

**推荐使用 ModelScope 源（国内加速）：**

```bash
MINERU_MODEL_SOURCE=modelscope /path/to/miniconda3/envs/mineru/bin/mineru-models-download
```

下载时会提示选择模型源和类型：
- **模型源**：选择 `modelscope`（国内）或 `huggingface`（国际）
- **模型类型**：
  - `pipeline` — 传统规则+小模型，体积小，推荐先安装
  - `vlm` — VLM 视觉语言模型（1.2B 参数），需额外 GPU 显存
  - `all` — 全部安装，体积较大（约 8GB），如需使用 hybrid 后端则必选

> 提示：如果只使用 `pipeline` 后端，选择 `pipeline` 类型即可，下载更快。
> `hybrid` 后端需要 `all` 类型的模型。

### 4. 配置 LaTeX 分隔符

模型下载完成后会自动生成 `~/mineru.json`，确认其中包含正确的 LaTeX 分隔符配置：

```json
{
    "latex-delimiter-config": {
        "inline": { "left": "$", "right": "$" },
        "display": { "left": "$$", "right": "$$" }
    }
}
```

此配置确保输出的 LaTeX 公式与前端 KaTeX 的 `remark-math` 插件兼容。

### 5. 启动 API 服务

```bash
# 指定 GPU（避免与 Omelette 的 embedding 模型争用）
# 设置 MINERU_MODEL_SOURCE=local 使用本地已下载的模型
CUDA_VISIBLE_DEVICES=6 MINERU_MODEL_SOURCE=local \
  /path/to/miniconda3/envs/mineru/bin/mineru-api --host 0.0.0.0 --port 8010
```

验证：访问 `http://localhost:8010/docs` 查看 Swagger 文档。

### 6. 测试解析

```bash
curl -s -X POST http://localhost:8010/file_parse \
  -F "files=@test.pdf" \
  -F "backend=pipeline" \
  -F "return_md=true" \
  -F "formula_enable=true" \
  -F "table_enable=true"
```

## API 参考

### `POST /file_parse`

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `files` | file[] | (必填) | 上传的 PDF 文件 |
| `backend` | str | `hybrid-auto-engine` | 解析后端 |
| `return_md` | bool | `true` | 返回 Markdown 内容 |
| `return_content_list` | bool | `false` | 返回结构化内容列表 |
| `return_images` | bool | `false` | 返回提取的图片 |
| `formula_enable` | bool | `true` | 启用公式解析 |
| `table_enable` | bool | `true` | 启用表格解析 |
| `lang_list` | str[] | `["ch"]` | OCR 语言（ch 支持中英混合） |
| `start_page_id` | int | `0` | 起始页码（从 0 开始） |
| `end_page_id` | int | `99999` | 结束页码 |

### 可用后端

| 后端 | 精度 | 速度 | GPU 需求 | 说明 |
|------|------|------|----------|------|
| `pipeline` | 中 (82+) | 快 | 6GB | 传统规则+小模型，多语言，无幻觉 |
| `hybrid-auto-engine` | 高 (90+) | 中 | 10GB | VLM + pipeline 融合，需下载 all 模型 |
| `vlm-auto-engine` | 高 | 中 | 8GB | 纯 VLM，仅支持中英文 |

### 响应格式

```json
{
  "backend": "pipeline",
  "version": "2.7.6",
  "results": {
    "<filename>": {
      "md_content": "# Title\n\nContent with $E=mc^2$ formulas..."
    }
  }
}
```

## Omelette 配置

在 Omelette 的 `.env` 中添加：

```env
PDF_PARSER=auto
MINERU_API_URL=http://localhost:8010
MINERU_BACKEND=pipeline
MINERU_TIMEOUT=300
```

## 可选：systemd 服务（生产环境）

创建 `/etc/systemd/system/mineru-api.service`：

```ini
[Unit]
Description=MinerU PDF Parsing API
After=network.target

[Service]
User=djx
Environment=CUDA_VISIBLE_DEVICES=6
Environment=MINERU_MODEL_SOURCE=local
ExecStart=/home/djx/miniconda3/envs/mineru/bin/mineru-api --host 0.0.0.0 --port 8010
WorkingDirectory=/home/djx
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now mineru-api
sudo systemctl status mineru-api
```

## 故障排除

| 问题 | 原因 | 解决 |
|------|------|------|
| `Max retries exceeded` HuggingFace | 未设置 `MINERU_MODEL_SOURCE=local` | 启动时加 `MINERU_MODEL_SOURCE=local` |
| `Engine core initialization failed` | hybrid 后端缺少 VLM 模型 | 重新下载模型选 `all`，或改用 `pipeline` 后端 |
| `address already in use` | 端口被占用 | `kill $(lsof -ti:8010)` 或换端口 |
| 首次请求很慢 | 模型加载到 GPU | 正常，后续请求会快很多 |
