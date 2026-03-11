---
title: "feat: 多模型 LLM 支持与前端设置配置系统"
type: feat
status: active
date: 2026-03-11
origin: docs/brainstorms/2026-03-11-ux-architecture-upgrade-brainstorm.md
---

# 多模型 LLM 支持与前端设置配置系统

## 1. Overview

### 1.1 为什么需要多模型支持

科研文献管理场景中，用户对 LLM 的需求多样化：

- **成本敏感**：不同任务（关键词扩展、去重、综述）对模型能力要求不同，用户希望按需选择经济型或高能力模型
- **合规与隐私**：部分机构要求使用国产云厂商（阿里云、火山引擎）或本地部署（Ollama）
- **能力对比**：研究者常需对比不同模型在文献理解、引用生成上的表现
- **可用性**：单一 provider 故障时需快速切换备用模型

### 1.2 当前限制

| 限制 | 现状 |
|------|------|
| **Provider 固定** | 仅支持 aliyun、volcengine、mock，扩展需改代码 |
| **配置来源单一** | 仅从 `.env` 读取，修改需重启服务 |
| **前端只读** | Settings 页仅展示配置，无法编辑或切换 |
| **无连接验证** | 配置错误时用户需自行排查 |
| **抽象层薄弱** | 直接使用 OpenAI SDK，未统一 ChatModel 接口 |

### 1.3 目标

- 支持 6 种 provider：OpenAI、Anthropic、阿里云百炼、火山引擎、Ollama、Mock
- 前端可配置、可切换模型，配置持久化到数据库
- 配置优先级：前端 DB 配置 > .env > 默认值
- 提供连接测试 API，用户可即时验证配置有效性

---

## 2. Technical Approach

### 2.1 后端：LLM 抽象层重构

**现状**：`LLMClient` 直接封装 `AsyncOpenAI`，provider 分支硬编码。

**目标**：引入 LangChain `BaseChatModel` 抽象，通过工厂模式按 provider 返回对应实现。

```
app/services/llm/
├── __init__.py
├── factory.py      # LLMProviderFactory: get_chat_model(provider, config) -> BaseChatModel
├── adapters/
│   ├── openai_adapter.py      # ChatOpenAI (OpenAI 官方)
│   ├── anthropic_adapter.py  # ChatAnthropic
│   ├── aliyun_adapter.py     # ChatOpenAI(base_url=dashscope)
│   ├── volcengine_adapter.py # ChatOpenAI(base_url=volcengine)
│   ├── ollama_adapter.py     # ChatOllama
│   └── mock_adapter.py       # 内置 Mock
└── client.py       # LLMClient 包装 ChatModel，保留 chat/chat_json 接口
```

**兼容性**：现有调用方（`rag_service`、`writing_service`、`keywords_service` 等）继续使用 `get_llm_client()`，内部改为从工厂获取 ChatModel 并适配。

### 2.2 后端：LLM Provider 工厂模式

```python
# 伪代码：factory.py
def get_chat_model(provider: str, config: LLMConfig) -> BaseChatModel:
    if provider == "openai":
        return ChatOpenAI(api_key=config.api_key, model=config.model)
    elif provider == "anthropic":
        return ChatAnthropic(api_key=config.api_key, model=config.model)
    elif provider == "aliyun":
        return ChatOpenAI(api_key=config.api_key, base_url=config.base_url, model=config.model)
    elif provider == "volcengine":
        return ChatOpenAI(api_key=config.api_key, base_url=config.base_url, model=config.model)
    elif provider == "ollama":
        return ChatOllama(base_url=config.base_url, model=config.model)
    elif provider == "mock":
        return MockChatModel()
    raise ValueError(f"Unknown provider: {provider}")
```

### 2.3 后端：UserSettings 服务

- **模型**：`UserSettings` 表，`key` (str) + `value` (JSON/str) 键值对
- **服务**：`UserSettingsService` 提供 CRUD、缓存、配置合并
- **配置合并**：合并 .env 与 DB 中的 settings，DB 覆盖 .env

### 2.4 后端：API Endpoints

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/settings` | 返回合并后的完整配置（API Key 脱敏） |
| PUT | `/api/v1/settings` | 更新用户可配置项（写入 DB） |
| GET | `/api/v1/settings/models` | 返回可用的 provider 及模型列表 |
| POST | `/api/v1/settings/test-connection` | 测试当前 LLM 配置连接 |

### 2.5 前端：Settings 页面重构

- **模型选择**：下拉选择 provider + 模型（如 `volcengine / doubao-seed-2-0-mini-260215`）
- **API Key 输入**：各 provider 的 API Key 输入框（密码类型，可显示/隐藏）
- **连接测试**：按钮触发 `POST /api/v1/settings/test-connection`，显示成功/失败
- **高级参数**：temperature、max_tokens 折叠面板
- **系统配置**：data_dir、embedding_model、代理等（只读或受限编辑）

### 2.6 前端：全局模型切换

- 在聊天输入框上方或 Playground 顶部增加模型选择器
- 选择后写入会话或全局状态，请求时携带 `model` 参数

---

## 3. Implementation Phases

### Phase 1: 后端 LLM 抽象层重构 + 多 Provider 支持

**目标**：在不改变现有调用方的前提下，支持 6 种 provider。

| 任务 | 说明 |
|------|------|
| 1.1 引入 LangChain | 添加 `langchain-openai`、`langchain-anthropic`、`langchain-community`（Ollama） |
| 1.2 创建 LLMConfig 模型 | Pydantic 模型，包含 provider、api_key、base_url、model、temperature、max_tokens |
| 1.3 实现 Provider 工厂 | `factory.py` 根据 provider 返回对应 ChatModel |
| 1.4 实现各 Adapter | `openai`、`anthropic`、`aliyun`、`volcengine`、`ollama`、`mock` |
| 1.5 重构 LLMClient | 内部使用工厂获取 ChatModel，保留 `chat()`、`chat_json()` 接口 |
| 1.6 扩展 config.py | 新增 OPENAI_*、ANTHROPIC_*、OLLAMA_* 环境变量 |
| 1.7 测试 | 单元测试覆盖各 provider，mock 模式保持 CI 通过 |

**预估**：1–2 天

### Phase 2: UserSettings 模型 + API

**目标**：持久化配置，提供 CRUD 与合并逻辑。

| 任务 | 说明 |
|------|------|
| 2.1 创建 UserSettings 模型 | `id`, `key`, `value` (JSON/str), `updated_at` |
| 2.2 数据库迁移 | Alembic 或手动迁移脚本 |
| 2.3 UserSettingsService | `get_all()`, `get(key)`, `set(key, value)`, `merge_with_env()` |
| 2.4 配置合并逻辑 | `.env` → `merge` → DB settings，DB 覆盖 .env |
| 2.5 GET/PUT /api/v1/settings | 实现 GET（合并+脱敏）、PUT（写入 DB） |
| 2.6 GET /api/v1/settings/models | 返回 provider 列表及每个 provider 的模型列表（可配置或硬编码） |
| 2.7 测试 | 测试合并逻辑、API 行为 |

**预估**：1–2 天

### Phase 3: 前端 Settings 页面重构

**目标**：用户可编辑 LLM 配置并保存。

| 任务 | 说明 |
|------|------|
| 3.1 表单组件 | 模型选择下拉、API Key 输入、连接测试按钮 |
| 3.2 PUT 集成 | 保存时调用 PUT /api/v1/settings |
| 3.3 高级参数 | temperature、max_tokens 折叠面板 |
| 3.4 模型列表 | 从 GET /api/v1/settings/models 获取可选模型 |
| 3.5 错误处理 | 保存失败、连接测试失败提示 |
| 3.6 测试 | 手动测试 + E2E（可选） |

**预估**：1 天

### Phase 4: 全局模型切换 UI + 连接测试

**目标**：聊天场景可切换模型，连接测试可用。

| 任务 | 说明 |
|------|------|
| 4.1 连接测试 API | POST /api/v1/settings/test-connection，发送简单 prompt 验证 |
| 4.2 前端连接测试 | 按钮触发，显示 loading、成功/失败状态 |
| 4.3 全局模型选择器 | 在 Playground 或聊天输入框上方显示当前模型，支持切换 |
| 4.4 状态同步 | 模型切换后写入 UserSettings 或会话状态 |
| 4.5 测试 | 覆盖连接测试、模型切换流程 |

**预估**：1 天

---

## 4. Configuration Merge Logic

### 4.1 优先级（从低到高）

1. **默认值**：代码中的默认值（如 `model="qwen3.5-plus"`）
2. **.env 文件**：`config.py` 通过 `pydantic-settings` 加载
3. **DB UserSettings**：用户通过前端保存的配置
4. **Runtime Override**：请求时显式传入的 `provider`、`model`（如聊天接口的 `model` 参数）

### 4.2 合并规则

```python
# 伪代码：UserSettingsService.merge_with_env()
def merge_llm_config() -> LLMConfig:
    env_config = _load_from_env()  # 从 settings 读取
    db_config = _load_from_db()    # 从 UserSettings 读取

    return LLMConfig(
        provider=db_config.provider or env_config.provider,
        api_key=db_config.api_key or env_config.api_key,
        base_url=db_config.base_url or env_config.base_url,
        model=db_config.model or env_config.model,
        temperature=db_config.temperature if db_config.temperature is not None else env_config.temperature,
        max_tokens=db_config.max_tokens if db_config.max_tokens is not None else env_config.max_tokens,
    )
```

**规则**：DB 中非空值覆盖 .env；空字符串视为「未设置」，仍使用 .env。

### 4.3 可配置 Key 列表

| Key | 类型 | 说明 |
|-----|------|------|
| `llm_provider` | str | 当前 provider |
| `llm_model` | str | 当前模型（或由 provider 决定） |
| `openai_api_key` | str | OpenAI API Key |
| `openai_model` | str | OpenAI 模型 |
| `anthropic_api_key` | str | Anthropic API Key |
| `anthropic_model` | str | Anthropic 模型 |
| `aliyun_api_key` | str | 阿里云 API Key |
| `aliyun_base_url` | str | 阿里云 base_url |
| `aliyun_model` | str | 阿里云模型 |
| `volcengine_api_key` | str | 火山引擎 API Key |
| `volcengine_base_url` | str | 火山引擎 base_url |
| `volcengine_model` | str | 火山引擎模型 |
| `ollama_base_url` | str | Ollama 服务地址 |
| `ollama_model` | str | Ollama 模型 |
| `llm_temperature` | float | 默认 temperature |
| `llm_max_tokens` | int | 默认 max_tokens |

---

## 5. Security

### 5.1 API Key 存储

| 方案 | 说明 |
|------|------|
| **明文存储** | 当前 .env 方式，DB 中同样可明文存储，实现简单 |
| **加密存储** | 使用 `app_secret_key` 对 API Key 加密后写入 DB，读取时解密 |
| **推荐** | 第一阶段可明文存储（单用户、本地部署）；若未来多用户，再引入加密 |

### 5.2 前端脱敏

- API Key 返回时：`sk-xxxx***xxxx` 格式，仅前 4 位 + 后 4 位
- 若用户输入新 Key 并保存，则完整写入；若未修改，则保持脱敏显示

### 5.3 连接测试

- 仅发送无害 prompt（如 "Hi"），不记录或存储
- 限流：同一 IP 每分钟最多 5 次，防止滥用

### 5.4 权限

- 当前为单用户，无需鉴权；若未来多用户，需校验当前用户是否可读写自己的 settings

---

## 6. Acceptance Criteria

### 6.1 后端

- [ ] 支持 6 种 provider：openai、anthropic、aliyun、volcengine、ollama、mock
- [ ] `get_llm_client(provider=...)` 可指定 provider，不指定时使用合并后的默认配置
- [ ] UserSettings 表存在，可存储 key-value 配置
- [ ] `GET /api/v1/settings` 返回合并后配置，API Key 脱敏
- [ ] `PUT /api/v1/settings` 可更新配置并持久化

- [ ] `GET /api/v1/settings/models` 返回各 provider 的可用模型列表
- [ ] `POST /api/v1/settings/test-connection` 可测试当前 LLM 连接，返回成功/失败
- [ ] 配置合并逻辑正确：DB 覆盖 .env
- [ ] 现有 `LLM_PROVIDER=mock` 的测试用例全部通过

### 6.2 前端

- [ ] Settings 页可编辑 LLM provider、模型、各 provider 的 API Key
- [ ] 保存后刷新页面，配置仍生效
- [ ] 连接测试按钮可触发测试并显示结果
- [ ] 高级参数（temperature、max_tokens）可编辑

- [ ] 聊天输入框上方或 Playground 有模型选择器，可切换当前模型
- [ ] 模型切换后，新请求使用新模型

### 6.3 端到端

- [ ] 仅配置 .env 时，系统行为与当前一致
- [ ] 通过前端配置后，无需重启服务即可生效
- [ ] 连接测试失败时，用户能明确看到错误信息

---

## 7. Code Examples

### 7.1 LLM Provider 工厂

```python
# app/services/llm/factory.py
from langchain_core.language_models import BaseChatModel
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain_community.chat_models import ChatOllama

from app.schemas.llm import LLMConfig

def get_chat_model(provider: str, config: LLMConfig) -> BaseChatModel:
    if provider == "openai":
        return ChatOpenAI(api_key=config.api_key, model=config.model)
    elif provider == "anthropic":
        return ChatAnthropic(api_key=config.api_key, model=config.model)
    elif provider == "aliyun":
        return ChatOpenAI(
            api_key=config.api_key,
            base_url=config.base_url or "https://dashscope.aliyuncs.com/compatible-mode/v1",
            model=config.model,
        )
    elif provider == "volcengine":
        return ChatOpenAI(
            api_key=config.api_key,
            base_url=config.base_url or "https://ark.cn-beijing.volces.com/api/v3",
            model=config.model,
        )
    elif provider == "ollama":
        return ChatOllama(base_url=config.base_url or "http://localhost:11434", model=config.model)
    elif provider == "mock":
        from app.services.llm.adapters.mock_adapter import MockChatModel
        return MockChatModel()
    raise ValueError(f"Unknown provider: {provider}")
```

### 7.2 UserSettingsService 合并逻辑

```python
# app/services/user_settings_service.py
def get_merged_llm_config(self) -> LLMConfig:
    env = self._env_config()
    db = self._db_config()

    return LLMConfig(
        provider=db.get("llm_provider") or env.llm_provider,
        api_key=db.get("api_key") or env.api_key,  # 按 provider 取对应 key
        base_url=db.get("base_url") or env.base_url,
        model=db.get("model") or env.model,
        temperature=float(db.get("llm_temperature", env.llm_temperature)),
        max_tokens=int(db.get("llm_max_tokens", env.llm_max_tokens)),
    )
```

### 7.3 Settings API

```python
# app/api/v1/settings_api.py
@router.get("", response_model=ApiResponse[SettingsSchema])
async def get_settings(db: AsyncSession = Depends(get_db)):
    service = UserSettingsService(db)
    merged = service.get_merged_settings()
    return ApiResponse(data=merged.to_schema(mask_sensitive=True))

@router.put("", response_model=ApiResponse[SettingsSchema])
async def put_settings(payload: SettingsUpdateSchema, db: AsyncSession = Depends(get_db)):
    service = UserSettingsService(db)
    await service.update(payload)
    merged = service.get_merged_settings()
    return ApiResponse(data=merged.to_schema(mask_sensitive=True))

@router.get("/models", response_model=ApiResponse[list[ProviderModelInfo]])
async def get_models():
    return ApiResponse(data=get_available_models())

@router.post("/test-connection", response_model=ApiResponse[dict])
async def test_connection(db: AsyncSession = Depends(get_db)):
    service = UserSettingsService(db)
    config = service.get_merged_llm_config()
    success, error = await test_llm_connection(config)
    return ApiResponse(data={"success": success, "error": error})
```

### 7.4 前端 Settings 表单（伪代码）

```tsx
// 模型选择
<Select value={provider} onValueChange={setProvider}>
  <SelectTrigger><SelectValue placeholder="选择 Provider" /></SelectTrigger>
  <SelectContent>
    {providers.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
  </SelectContent>
</Select>

<Select value={model} onValueChange={setModel}>
  <SelectTrigger><SelectValue placeholder="选择模型" /></SelectTrigger>
  <SelectContent>
    {models[provider]?.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
  </SelectContent>
</Select>

// API Key
<Input type={showKey ? "text" : "password"} value={apiKey} onChange={...} />

// 连接测试
<Button onClick={testConnection} disabled={testing}>
  {testing ? "测试中..." : "测试连接"}
</Button>
```

---

## 8. Provider 配置变量速查表

| 提供商 | 集成方式 | 配置变量 |
|--------|----------|----------|
| OpenAI | `ChatOpenAI` | OPENAI_API_KEY, OPENAI_MODEL |
| Anthropic | `ChatAnthropic` | ANTHROPIC_API_KEY, ANTHROPIC_MODEL |
| 阿里云百炼 | `ChatOpenAI(base_url=dashscope)` | ALIYUN_API_KEY, ALIYUN_MODEL |
| 火山引擎 | `ChatOpenAI(base_url=volcengine)` | VOLCENGINE_API_KEY, VOLCENGINE_MODEL |
| 本地 Ollama | `ChatOllama` | OLLAMA_BASE_URL, OLLAMA_MODEL |
| Mock | 内置 Mock | LLM_PROVIDER=mock |

---

## 9. 附录：依赖变更

```toml
# pyproject.toml 新增
dependencies = [
    "langchain-core>=0.3",
    "langchain-openai>=0.3",
    "langchain-anthropic>=0.3",
    "langchain-community>=0.3",  # ChatOllama
    # ... 现有依赖
]
```
