# 配置

复制 `.env.example` 为 `.env` 并自定义。

## LLM 设置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `LLM_PROVIDER` | `openai`, `anthropic`, `aliyun`, `volcengine`, `ollama`, `mock` | `mock` |
| `OPENAI_API_KEY` | OpenAI API 密钥 | — |
| `ANTHROPIC_API_KEY` | Anthropic API 密钥 | — |
| `ALIYUN_API_KEY` | 阿里云百炼 API 密钥 | — |
| `VOLCENGINE_API_KEY` | 火山引擎豆包 API 密钥 | — |

## GPU 管理

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `GPU_MODE` | `conservative`, `balanced`, `aggressive` | `balanced` |
| `MODEL_TTL_SECONDS` | 空闲模型自动卸载时间（秒） | `300` |
| `MINERU_AUTO_MANAGE` | 自动管理 MinerU 子进程 | `true` |

## 数据与存储

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DATABASE_URL` | SQLite 数据库路径 | `sqlite:///./data/omelette.db` |
| `DATA_DIR` | 数据存储目录 | `data` |

## PDF 处理

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PDF_PARSER` | `auto`, `mineru`, `pdfplumber` | `auto` |
| `OCR_ENGINE` | `paddle` 或 `tesseract` | `paddle` |

## 学术源

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `SEMANTIC_SCHOLAR_API_KEY` | 更高速率限制 | — |

## 服务器

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `APP_ENV` | `development` 或 `production` | `development` |
| `APP_SECRET_KEY` | 会话签名密钥 | `change-me-to-a-random-secret-key` |

## Mock 模式

当 `LLM_PROVIDER=mock` 时，Omelette 返回预设响应，无需 API 密钥。适用于：
- 无 API 成本的开发
- 测试与 CI
- 配置前探索 UI
