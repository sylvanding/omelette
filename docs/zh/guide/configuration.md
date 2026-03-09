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

`LLM_PROVIDER` 可选：

- **aliyun** — 阿里云百炼。需设置 `ALIYUN_API_KEY`、`ALIYUN_BASE_URL`、`ALIYUN_MODEL`
- **volcengine** — 火山引擎豆包。需设置 `VOLCENGINE_API_KEY` 等
- **mock** — 不调用真实 LLM，返回预设结果，用于测试

## GPU

| 变量 | 说明 | 默认 |
|------|------|------|
| `CUDA_VISIBLE_DEVICES` | OCR/嵌入使用的 GPU ID | 0,3 |

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
