# Settings API

Base path: `/api/v1/settings`

## Overview

The Settings API manages application configuration: LLM provider selection, model parameters, API keys for various providers (OpenAI, Anthropic, Aliyun, Volcengine, Ollama), embedding/reranker models, and other system settings. Values are merged from environment variables with DB overrides; API keys are masked in responses.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/settings` | Get all settings |
| PUT | `/settings` | Update settings (partial) |
| GET | `/settings/models` | List available models per provider |
| POST | `/settings/test-connection` | Test LLM provider connection |
| GET | `/settings/health` | Health check |

---

## GET /api/v1/settings

**Description:** Return merged settings (DB overrides .env). API keys are masked (e.g. `sk-12***abcd`).

**Response:** `ApiResponse[SettingsSchema]`

### SettingsSchema

| Field | Type | Description |
|-------|------|-------------|
| `llm_provider` | string | Default LLM provider (`openai`, `anthropic`, `aliyun`, `volcengine`, `ollama`, `mock`) |
| `llm_model` | string | Default model (overrides provider default) |
| `llm_temperature` | float | Temperature (0.0–2.0) |
| `llm_max_tokens` | int | Max tokens |
| `openai_api_key` | string | OpenAI API key (masked) |
| `openai_model` | string | OpenAI model |
| `anthropic_api_key` | string | Anthropic API key (masked) |
| `anthropic_model` | string | Anthropic model |
| `aliyun_api_key` | string | Aliyun API key (masked) |
| `aliyun_base_url` | string | Aliyun base URL |
| `aliyun_model` | string | Aliyun model |
| `volcengine_api_key` | string | Volcengine API key (masked) |
| `volcengine_base_url` | string | Volcengine base URL |
| `volcengine_model` | string | Volcengine model |
| `ollama_base_url` | string | Ollama base URL |
| `ollama_model` | string | Ollama model |
| `embedding_model` | string | Embedding model name |
| `reranker_model` | string | Reranker model name |
| `data_dir` | string | Data directory path |
| `cuda_visible_devices` | string | CUDA device IDs |
| `semantic_scholar_api_key` | string | Semantic Scholar API key (masked) |
| `unpaywall_email` | string | Unpaywall email |

### Get Settings Example

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

**Description:** Update user-configurable settings. Only non-null fields are applied. Masked API keys (containing `***`) are skipped to avoid overwriting secrets.

**Request:** `SettingsUpdateSchema` (partial, all fields optional)

| Field | Type | Constraints |
|-------|------|-------------|
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

**Response:** `ApiResponse[SettingsSchema]` (updated merged settings)

### Update Settings Example

```bash
curl -X PUT "http://localhost:8000/api/v1/settings" \
  -H "Content-Type: application/json" \
  -d '{"llm_provider": "openai", "llm_model": "gpt-4o-mini"}'
```

---

## GET /api/v1/settings/models

**Description:** Return available LLM providers and their model lists.

**Response:** `ApiResponse[list[ProviderModelInfo]]`

### ProviderModelInfo

| Field | Type | Description |
|-------|------|-------------|
| `provider` | string | Provider ID |
| `display_name` | string | Display name |
| `models` | string[] | List of model IDs |
| `requires_api_key` | bool | Whether API key is required |
| `requires_base_url` | bool | Whether base URL is configurable |
| `default_base_url` | string | Default base URL if applicable |

### List Models Example

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

**Description:** Test the current LLM configuration by sending a simple prompt. Uses merged settings from DB (no request body).

**Response:** `ApiResponse[dict]`

| Field | Type | Description |
|-------|------|-------------|
| `success` | bool | Whether the test succeeded |
| `response` | string | First 200 chars of LLM response (on success) |
| `error` | string | Error message (on failure) |

### Test Connection Example

```bash
curl -X POST "http://localhost:8000/api/v1/settings/test-connection"
```

**Success:**
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

**Failure:**
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

**Description:** Simple health check endpoint.

**Response:** `ApiResponse[dict]`

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `"healthy"` |
| `version` | string | Application version |

### Health Check Example

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

## Error Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad request (e.g. invalid temperature range) |
| 422 | Validation error (invalid request body) |
| 500 | Server error (e.g. connection test failure) |
