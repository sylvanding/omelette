# 配置说明

Omelette 通过环境变量配置。复制 `.env.example` 为 `.env` 并修改。

## 应用

| 变量 | 说明 | 默认 |
|------|------|------|
| `APP_ENV` | development / production / testing | development |
| `APP_DEBUG` | 调试模式 | true |
| `APP_HOST` | 后端监听地址 | 0.0.0.0 |
| `APP_PORT` | 后端端口 | 8000 |

## 数据库

| 变量 | 说明 | 默认 |
|------|------|------|
| `DATABASE_URL` | SQLite 连接串 | sqlite:///./data/omelette.db |

## 数据存储

| 变量 | 说明 |
|------|------|
| `DATA_DIR` | PDF、OCR、ChromaDB 根目录 |
| `PDF_DIR` | PDF 存储（默认 {DATA_DIR}/pdfs） |
| `OCR_OUTPUT_DIR` | OCR 输出（默认 {DATA_DIR}/ocr_output） |
| `CHROMA_DB_DIR` | ChromaDB 路径（默认 {DATA_DIR}/chroma_db） |

## LLM 提供商

`LLM_PROVIDER` 可选：`openai`、`anthropic`、`aliyun`、`volcengine`、`ollama`、`mock`。

### OpenAI

| 变量 | 说明 |
|------|------|
| `OPENAI_API_KEY` | OpenAI API Key |
| `OPENAI_MODEL` | 模型名（默认 gpt-4o-mini） |

### Anthropic

| 变量 | 说明 |
|------|------|
| `ANTHROPIC_API_KEY` | Anthropic API Key |
| `ANTHROPIC_MODEL` | 模型名（默认 claude-sonnet-4-20250514） |

### 阿里云百炼

| 变量 | 说明 |
|------|------|
| `ALIYUN_API_KEY` | 阿里云 API Key |
| `ALIYUN_BASE_URL` | OpenAI 兼容端点 |
| `ALIYUN_MODEL` | 模型名（如 qwen3.5-plus） |

### 火山引擎豆包

| 变量 | 说明 |
|------|------|
| `VOLCENGINE_API_KEY` | 火山引擎 API Key |
| `VOLCENGINE_BASE_URL` | OpenAI 兼容端点 |
| `VOLCENGINE_MODEL` | 模型名 |

### Ollama（本地）

| 变量 | 说明 |
|------|------|
| `OLLAMA_BASE_URL` | Ollama 服务地址（默认 http://localhost:11434） |
| `OLLAMA_MODEL` | 模型名（默认 llama3） |

### Mock

使用 `LLM_PROVIDER=mock` 可在无 API Key 下测试，无需额外变量。

## 嵌入

| 变量 | 说明 | 默认 |
|------|------|------|
| `EMBEDDING_PROVIDER` | local / api / mock | local |
| `EMBEDDING_MODEL` | 模型名（local 用 HuggingFace；api 用 OpenAI 兼容） | BAAI/bge-m3 |

- **local**：使用 sentence-transformers，自动检测 GPU
- **api**：使用 OpenAI 兼容嵌入 API
- **mock**：确定性 mock，用于测试

## GPU

| 变量 | 说明 | 默认 |
|------|------|------|
| `CUDA_VISIBLE_DEVICES` | OCR/嵌入使用的 GPU ID（逗号分隔） | 0,3 |

## 代理

| 变量 | 说明 |
|------|------|
| `HTTP_PROXY` | HTTP 代理 URL |
| `HTTPS_PROXY` | HTTPS 代理 URL |

## 外部 API

| 变量 | 说明 |
|------|------|
| `SEMANTIC_SCHOLAR_API_KEY` | 可选，提高 Semantic Scholar 限速 |
| `UNPAYWALL_EMAIL` | Unpaywall PDF 查询所需 |

## 前端设置

LLM 提供商、模型、温度、API Key 等可在 Web 界面的 **设置** 页面（`/settings`）配置。这些设置会覆盖环境变量，按用户存储在数据库中，用于在不修改 `.env` 的情况下进行个性化配置。
