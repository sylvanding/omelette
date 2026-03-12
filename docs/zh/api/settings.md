# 设置 API

基础路径：`/api/v1/settings`

## 简介

设置 API 用于管理应用配置：LLM 提供商选择、模型参数、各提供商（OpenAI、Anthropic、阿里云、火山引擎、Ollama）的 API 密钥、嵌入/重排序模型及其他系统设置。配置值由环境变量与数据库覆盖合并而成；API 密钥在响应中会被脱敏显示。

## 端点概览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/settings` | 获取全部设置 |
| PUT | `/settings` | 更新设置（部分更新） |
| GET | `/settings/models` | 按提供商列出可用模型 |
| POST | `/settings/test-connection` | 测试 LLM 提供商连接 |
| GET | `/settings/health` | 健康检查 |

---

## GET /api/v1/settings

**说明：** 返回合并后的设置（数据库覆盖 .env）。API 密钥会被脱敏（如 `sk-12***abcd`）。

**响应：** `ApiResponse[SettingsSchema]`

### SettingsSchema 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `llm_provider` | string | 默认 LLM 提供商（`openai`、`anthropic`、`aliyun`、`volcengine`、`ollama`、`mock`） |
| `llm_model` | string | 默认模型（覆盖提供商默认值） |
| `llm_temperature` | float | 温度（0.0–2.0） |
| `llm_max_tokens` | int | 最大 token 数 |
| `openai_api_key` | string | OpenAI API 密钥（脱敏） |
| `openai_model` | string | OpenAI 模型 |
| `anthropic_api_key` | string | Anthropic API 密钥（脱敏） |
| `anthropic_model` | string | Anthropic 模型 |
| `aliyun_api_key` | string | 阿里云 API 密钥（脱敏） |
| `aliyun_base_url` | string | 阿里云 base URL |
| `aliyun_model` | string | 阿里云模型 |
| `volcengine_api_key` | string | 火山引擎 API 密钥（脱敏） |
| `volcengine_base_url` | string | 火山引擎 base URL |
| `volcengine_model` | string | 火山引擎模型 |
| `ollama_base_url` | string | Ollama base URL |
| `ollama_model` | string | Ollama 模型 |
| `embedding_model` | string | 嵌入模型名称 |
| `reranker_model` | string | 重排序模型名称 |
| `data_dir` | string | 数据目录路径 |
| `cuda_visible_devices` | string | CUDA 设备 ID |
| `semantic_scholar_api_key` | string | Semantic Scholar API 密钥（脱敏） |
| `unpaywall_email` | string | Unpaywall 邮箱 |

### 获取设置示例

```bash
curl -X GET "http://localhost:8000/api/v1/settings"
```

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "llm_provider": "openai",
    "llm_model": "gpt-4o-mini",
    "llm_temperature": 0.7,
    "llm_max_tokens": 4096,
    "openai_api_key": "sk-12***abcd",
    "openai_model": "gpt-4o-mini",
    "anthropic_api_key": "",
    "anthropic_model": "",
    "aliyun_api_key": "",
    "aliyun_base_url": "",
    "aliyun_model": "",
    "volcengine_api_key": "",
    "volcengine_base_url": "",
    "volcengine_model": "",
    "ollama_base_url": "http://localhost:11434",
    "ollama_model": "",
    "embedding_model": "BAAI/bge-m3",
    "reranker_model": "",
    "data_dir": "/data0/djx/omelette",
    "cuda_visible_devices": "",
    "semantic_scholar_api_key": "",
    "unpaywall_email": ""
  }
}
```

---

## PUT /api/v1/settings

**说明：** 更新用户可配置的设置。仅非空字段会被应用。包含 `***` 的脱敏 API 密钥会被跳过，避免覆盖真实密钥。

**请求体：** `SettingsUpdateSchema`（部分更新，所有字段可选）

| 字段 | 类型 | 约束 |
|------|------|------|
| `llm_provider` | string | — |
| `llm_model` | string | — |
| `llm_temperature` | float | 0.0–2.0 |
| `llm_max_tokens` | int | 1–128000 |
| `openai_api_key` | string | — |
| `openai_model` | string | — |
| `anthropic_api_key` | string | — |
| `anthropic_model` | string | — |
| `aliyun_api_key` | string | — |
| `aliyun_base_url` | string | — |
| `aliyun_model` | string | — |
| `volcengine_api_key` | string | — |
| `volcengine_base_url` | string | — |
| `volcengine_model` | string | — |
| `ollama_base_url` | string | — |
| `ollama_model` | string | — |

**响应：** `ApiResponse[SettingsSchema]`（更新后的合并设置）

### 更新设置示例

```bash
curl -X PUT "http://localhost:8000/api/v1/settings" \
  -H "Content-Type: application/json" \
  -d '{"llm_provider": "openai", "llm_model": "gpt-4o-mini"}'
```

---

## GET /api/v1/settings/models

**说明：** 返回可用的 LLM 提供商及其模型列表。

**响应：** `ApiResponse[list[ProviderModelInfo]]`

### ProviderModelInfo 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `provider` | string | 提供商 ID |
| `display_name` | string | 显示名称 |
| `models` | string[] | 模型 ID 列表 |
| `requires_api_key` | bool | 是否需要 API 密钥 |
| `requires_base_url` | bool | 是否可配置 base URL |
| `default_base_url` | string | 默认 base URL（若适用） |

### 模型列表示例

```bash
curl -X GET "http://localhost:8000/api/v1/settings/models"
```

```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "provider": "openai",
      "display_name": "OpenAI",
      "models": ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "o3-mini"],
      "requires_api_key": true,
      "requires_base_url": false,
      "default_base_url": ""
    },
    {
      "provider": "ollama",
      "display_name": "Ollama (本地)",
      "models": ["llama3", "llama3.1", "mistral", "qwen2", "deepseek-r1"],
      "requires_api_key": false,
      "requires_base_url": true,
      "default_base_url": "http://localhost:11434"
    }
  ]
}
```

---

## POST /api/v1/settings/test-connection

**说明：** 使用当前 LLM 配置发送简单提示进行连接测试。使用数据库中的合并配置（无请求体）。

**响应：** `ApiResponse[dict]`

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | bool | 测试是否成功 |
| `response` | string | LLM 响应前 200 字符（成功时） |
| `error` | string | 错误信息（失败时） |

### 连接测试示例

```bash
curl -X POST "http://localhost:8000/api/v1/settings/test-connection"
```

**成功：**
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "success": true,
    "response": "OK."
  }
}
```

**失败：**
```json
{
  "code": 500,
  "message": "Connection test failed",
  "data": {
    "success": false,
    "error": "Invalid API key"
  }
}
```

---

## GET /api/v1/settings/health

**说明：** 简单健康检查端点。

**响应：** `ApiResponse[dict]`

| 字段 | 类型 | 说明 |
|------|------|------|
| `status` | string | `"healthy"` |
| `version` | string | 应用版本 |

### 健康检查示例

```bash
curl -X GET "http://localhost:8000/api/v1/settings/health"
```

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "status": "healthy",
    "version": "0.1.0"
  }
}
```

---

## 错误码

| 错误码 | 说明 |
|--------|------|
| 200 | 成功 |
| 400 | 请求错误（如温度范围无效） |
| 422 | 校验错误（请求体无效） |
| 500 | 服务端错误（如连接测试失败） |
