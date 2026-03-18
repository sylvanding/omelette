# 后端全面复盘与提示词审计

**日期**: 2026-03-17
**范围**: 后端架构、代码质量、提示词管理、改进计划
**状态**: 进行中

---

## 一、我们要做什么

对 Omelette 后端进行全面复盘，涵盖：
1. 当前架构和模块职责的梳理
2. 按优先级列出所有需要修复的问题
3. 对每个 LLM 提示词的质量评估和改进建议
4. 具体的优化方案和实施步骤

---

## 二、现状梳理

### 2.1 整体架构

```
FastAPI App (main.py)
├── Middleware: Auth → CORS → RateLimit
├── API Layer (api/v1/)
│   ├── projects, papers, upload, keywords, search
│   ├── dedup, crawler, ocr, subscription
│   ├── rag, writing, tasks, settings
│   ├── conversations, chat, rewrite, pipelines
│   └── deps.py (共享依赖)
├── Service Layer (services/)
│   ├── llm/ (LLMClient + 工厂模式 + 适配器)
│   ├── rag_service (LlamaIndex + ChromaDB)
│   ├── writing_service, completion_service
│   ├── dedup_service, keyword_service
│   ├── search_service, crawler_service, ocr_service
│   ├── subscription_service, pipeline_service
│   ├── embedding_service, citation_graph_service
│   └── paper_processor, pdf_metadata, mineru_client
├── Pipeline Layer (pipelines/)
│   ├── Search Pipeline: search→dedup→[HITL]→import→crawl→ocr→index
│   ├── Upload Pipeline: extract→dedup→[HITL]→ocr→index
│   └── Chat Pipeline: understand→retrieve→rank→clean→generate→persist
├── Models (SQLAlchemy Async): Project, Paper, PaperChunk, Keyword,
│   Subscription, Task, Conversation, Message, UserSettings
├── Schemas (Pydantic v2): 每个模块的请求/响应
├── MCP Server: tools + resources + prompts
└── Alembic Migrations (5 versions)
```

### 2.2 数据流

**Chat 流程**: 用户消息 → understand (加载历史 + 构建 system prompt) → retrieve (RAG 并行查询多知识库) → rank (匹配论文元数据 + 构建引用列表) → clean (并行 LLM 清洗 OCR 摘录) → generate (流式生成回答) → persist (保存到 DB)

**搜索管道**: 关键词 → 多源搜索 (Semantic Scholar, OpenAlex, arXiv, Crossref) → 去重 (DOI → 标题相似度 → LLM 验证) → [HITL 冲突解决] → 导入 → PDF 爬取 → OCR → 知识库索引

**写作流程**: 选择文献 → 生成提纲 → 逐章节 RAG 检索 → 逐章节 LLM 撰写 → SSE 流式输出

### 2.3 LLM 调用链路

```
调用方 → LLMClient.chat/chat_stream/chat_json
       → _to_langchain_messages (dict → SystemMessage/HumanMessage/AIMessage)
       → LangChain BaseChatModel.ainvoke/astream
       → Provider (OpenAI/Anthropic/Aliyun/Volcengine/Ollama/Mock)
```

所有 LLM 调用都通过 `LLMClient`，没有直接调用 provider SDK 的情况。

---

## 三、问题清单（按优先级）

### P0 — 高优先级（影响正确性或稳定性）

#### 3.1 异步中的同步阻塞调用

| 位置 | 阻塞调用 | 影响 |
|------|---------|------|
| `subscription_service.py:29` | `feedparser.parse(resp.text)` | CPU 密集，阻塞事件循环 |
| `pdf_metadata.py:39` | `fitz.open()` + 页面遍历 | I/O + CPU 密集 |
| `rag_service.py:220,230,299,305` | `collection.count()` (sync ChromaDB) | 每次 query 调用两次 |
| `database.py:71,112` | `subprocess.run()` 跑 Alembic | 启动时阻塞（可接受但非理想） |

**修复方案**: 全部包裹 `asyncio.to_thread()`。`collection.count()` 结果可缓存。

#### 3.2 会话双重提交

`conversations.py` 中 create/update/delete 手动调用 `await db.commit()`，而 `get_session()` 在 yield 后也会自动 commit。

```python
# database.py — get_session 自动 commit
yield session
await session.commit()   # ← 第二次

# conversations.py — 手动 commit
await db.commit()        # ← 第一次
```

**修复方案**: 移除 `conversations.py` 中手动 commit，依赖 `get_session()` 的自动 commit。同样检查 `pipelines/chat/nodes.py:persist_node`（line 430 手动 commit）。

#### 3.3 异常吞没

| 位置 | 问题 |
|------|------|
| `rag_service.py:206-207` | `except Exception: pass` — 上下文扩展失败静默忽略 |
| `rag_service.py:393-395` | `get_stats` 异常返回空结果，无日志 |
| `completion_service.py:69` | 异常时返回空补全，丢失错误信息 |
| `main.py:75` | MCP server 挂载失败静默处理 |

**修复方案**: 至少添加 `logger.warning`/`logger.debug`；关键路径应传播异常。

### P1 — 中优先级（影响可维护性和性能）

#### 3.4 提示词散落与重复

提示词分布在 10+ 个文件中，没有集中管理。具体重复：
- "You are a scientific terminology expert. Return valid JSON only." — 出现在 `keyword_service.py` 和 `keywords.py`
- "You are a deduplication expert. Return valid JSON only." — 出现在 `dedup_service.py` 和 `dedup.py`
- "You are a scientific writing expert. Generate well-structured review outlines." — 在 `writing_service.py` 中出现两次
- 关键词扩展的 user prompt 在 `keyword_service.py` 和 `keywords.py` 中各有一份，内容不同

**修复方案**: 见第四节「提示词审计」。

#### 3.5 API 层包含业务逻辑

`api/v1/dedup.py` 的 `auto_resolve_conflict` (line 198-222) 和 `api/v1/keywords.py` 的 `expand_keywords` (line 119-130) 直接在 API 层构建 LLM prompt 并调用 LLM，而不是委托给 service。

**修复方案**: 将 LLM 调用移到对应 service 中，API 层只做请求分发。

#### 3.6 缺少分页

| 端点 | 问题 |
|------|------|
| `keywords.py:list_keywords` | 返回所有关键词，无分页 |
| `subscription.py:list_subscriptions` | 返回所有订阅，无分页 |
| `tasks.py:list_tasks` | 只有 `limit=50`，无页码 |

#### 3.7 写作服务串行 LLM 调用

`writing_service.py:summarize_papers` 逐篇调用 LLM 生成摘要，可用 `asyncio.gather` 并行化。同理 `generate_citations` 虽无 LLM 调用但可类似优化。

#### 3.8 去重算法 O(n²) 复杂度

`title_similarity_dedup` 和 `find_llm_dedup_candidates` 使用双重循环对比所有论文标题，O(n²) 复杂度。当论文数量大时性能差。

**修复方案**: 可考虑分桶（首字母/长度）减少比较次数，或使用 MinHash/SimHash 近似算法。

### P2 — 低优先级（改进体验和代码质量）

#### 3.9 资源 404 检查重复

`subscription.py` 中相同的 404 检查模式重复 4 次，`papers.py`、`keywords.py` 中也有类似模式。

**修复方案**: 抽取 `get_resource_or_404(db, Model, id, project_id)` 通用依赖。

#### 3.10 健康检查需要认证

`/api/v1/settings/health` 不在 `EXEMPT_PATHS` 中，设置 `api_secret_key` 后负载均衡器无法直接访问。

#### 3.11 硬编码配置值

| 位置 | 值 | 建议 |
|------|---|------|
| `upload.py:28` | `MAX_FILE_SIZE_MB = 50` | 移入 config |
| `rate_limit.py:15` | `"120/minute"` | 移入 config |
| `settings_api.py:65` | 版本号 `"0.1.0"` | 移入 config 或 pyproject.toml |
| `chat/nodes.py:56` | `_clean_semaphore = Semaphore(3)` | 移入 config |
| `rewrite.py:23` | `_rewrite_semaphore = Semaphore(3)` | 移入 config |

#### 3.12 pyproject.toml 依赖清理

`aiohttp` 在依赖列表中但未使用（项目使用 `httpx`），应移除。

#### 3.13 conversation 列表查询中的内存过滤

`list_conversations` 在 `knowledge_base_id` 过滤时，先从 DB 取出数据再在 Python 中过滤（line 70-73），导致分页计数不准确。应在 SQL 层完成过滤。

---

## 四、提示词审计

### 4.1 提示词分布总览

共发现 **16 个不同的提示词**，分布在 8 个文件中：

| # | 文件 | 用途 | system prompt | 语言 | 质量评级 |
|---|------|------|---------------|------|---------|
| 1 | `chat/nodes.py` | QA 模式 | "You are a scientific research assistant..." | EN | ★★★☆ |
| 2 | `chat/nodes.py` | Citation lookup | "You are a citation finder..." | EN | ★★★☆ |
| 3 | `chat/nodes.py` | Review outline | "You are a literature review expert..." | EN | ★★★☆ |
| 4 | `chat/nodes.py` | Gap analysis | "You are a research gap analyst..." | EN | ★★★☆ |
| 5 | `chat/nodes.py` | 无 KB 回退 | "You are a helpful scientific research assistant..." | EN | ★★☆☆ |
| 6 | `chat/nodes.py` | OCR 清洗 | "Clean up the following text..." | EN | ★★★★ |
| 7 | `writing_service.py` | 章节撰写 | "你是一位学术综述写作专家..." | **ZH** | ★★★☆ |
| 8 | `writing_service.py` | 论文摘要 | "You are a scientific paper analyst..." | EN | ★★☆☆ |
| 9 | `writing_service.py` | 综述提纲 | "You are a scientific writing expert..." | EN | ★★☆☆ |
| 10 | `writing_service.py` | 差距分析 | "You are a research gap analyst..." | EN | ★★☆☆ |
| 11 | `rag_service.py` | 知识库问答 | "You are a scientific research assistant..." | EN | ★★★☆ |
| 12 | `dedup_service.py` | LLM 去重 | "You are a scientific literature deduplication expert..." | EN | ★★★☆ |
| 13 | `dedup.py` (API) | 自动解决冲突 | "You are a deduplication expert..." | EN | ★★☆☆ |
| 14 | `keyword_service.py` | 关键词扩展 | "You are a scientific terminology expert..." | EN | ★★★☆ |
| 15 | `completion_service.py` | 写作补全 | "你是一个科研写作助手..." | **ZH** | ★★★★ |
| 16 | `rewrite.py` | 文本改写 | (4 个子 prompt) | 混合 | ★★★☆ |

### 4.2 逐项评估与改进建议

#### P1: Chat 管道 system prompts (`TOOL_MODE_PROMPTS`)

**现状**: 4 个模式各有简短 system prompt，功能角色定义清晰，但缺少：
- 输出格式约束（回答长度、结构要求）
- 语言偏好指示
- 对"不知道"的处理边界更精确的指导

**改进建议**:
```
"qa": 增加 "Structure your answer with clear paragraphs. "
      "Respond in the same language as the user's question."
"citation_lookup": 增加 "Include DOI when available."
"review_outline": 增加 "Use markdown headers for sections."
"gap_analysis": 增加 "Organize by theme, not by individual papers."
```

#### P2: Chat 无 KB 回退 prompt

**现状**: "You are a helpful scientific research assistant." — 过于泛化，没有约束。
**改进建议**: 增加领域约束和行为边界：
```
"You are a scientific research assistant specializing in academic literature analysis. "
"Answer questions clearly and accurately based on your knowledge. "
"When the user's question is outside your expertise or you are uncertain, say so honestly. "
"Respond in the same language as the user's question."
```

#### P3: Writing Service — 语言不一致

**现状**: `SECTION_SYSTEM_PROMPT` 用中文，其他 3 个 system prompt 用英文。
**改进建议**: 统一为英文。中文需求通过 user prompt 中的 `language` 参数控制。

#### P4: Writing Service — system prompt 过于简短

**现状**: `"You are a scientific paper analyst. Provide concise, accurate summaries."` — 太笼统。
**改进建议**:
```
"You are a scientific paper analyst. Provide structured, accurate summaries. "
"Focus on empirical findings and methodology. "
"Do not hallucinate information not present in the provided metadata."
```

#### P5: RAG Service 的 system prompt 与 Chat QA 重复

**现状**: `rag_service._generate_answer` 和 `chat/nodes.py` 的 QA 模式有高度相似但不完全一致的 system prompt。
**改进建议**: 统一为同一个常量。

#### P6: Dedup — API 层和 Service 层提示词不一致

**现状**:
- Service 层: "You are a **scientific literature** deduplication expert."
- API 层: "You are a **deduplication** expert." — 少了 "scientific literature"

**改进建议**: 移除 API 层的 LLM 调用，统一到 service 层。

#### P7: 关键词扩展 — 双重实现

**现状**: `keyword_service.py` 和 `keywords.py` 各自独立实现了关键词扩展，user prompt 内容不同。
**改进建议**: 移除 API 层实现，统一使用 service。

#### P8: Completion prompt — 中文硬编码

**现状**: `COMPLETION_SYSTEM_PROMPT` 写死中文 "你是一个科研写作助手"。
**改进建议**: 改为英文，保持一致性：
```
"You are a scientific writing assistant. Predict and complete the user's text. "
"Return only the completion (do not repeat the user's input), max 50 characters. "
"If you cannot predict, return an empty string. "
"Return plain text only, no quotes, explanations, or formatting."
```

#### P9: Rewrite prompts — translate_zh 单独用中文

**现状**: 4 个改写 prompt 中有 3 个英文、1 个中文。
**改进建议**: 统一为英文。

### 4.3 提示词集中管理方案

**推荐方案**: 创建 `app/prompts/` 模块，按功能域组织：

```
app/prompts/
├── __init__.py          # 统一导出
├── chat.py              # Chat 管道 prompts
├── writing.py           # 写作助手 prompts
├── rag.py               # RAG 知识库 prompts
├── dedup.py             # 去重 prompts
├── keyword.py           # 关键词 prompts
├── completion.py        # 补全 prompts
└── rewrite.py           # 改写 prompts
```

每个文件导出命名常量：
```python
# app/prompts/chat.py
CHAT_QA_SYSTEM = "You are a scientific research assistant..."
CHAT_CITATION_SYSTEM = "You are a citation finder..."
CHAT_OUTLINE_SYSTEM = "You are a literature review expert..."
CHAT_GAP_SYSTEM = "You are a research gap analyst..."
CHAT_FALLBACK_SYSTEM = "You are a scientific research assistant..."
EXCERPT_CLEAN_SYSTEM = "Clean up the following text..."
```

优点：
- 所有提示词集中管理，便于审查和迭代
- 消除重复定义
- 方便未来支持用户自定义提示词
- 可轻松添加多语言支持

---

## 五、关键决策

1. **提示词统一为英文** — LLM 对英文提示词理解最好，用户语言偏好通过 prompt 参数动态传递
2. **提示词集中到 `app/prompts/` 模块** — 不用外部文件（YAML/JSON），保持 Python 代码的类型安全和重构友好
3. **API 层不直接调用 LLM** — 所有 LLM 相关逻辑归入 service 层
4. **所有 LLM 调用都应有 system prompt** — 即使是简单任务（如 connection test）也应有明确角色定义
5. **异步阻塞修复优先于新功能** — 保证运行时稳定性

---

## 六、改进计划

### Phase 1: 关键修复（1-2 天）

- [ ] 修复异步中的同步阻塞调用（P0-3.1）
  - `subscription_service.py`: 包裹 `feedparser.parse`
  - `pdf_metadata.py`: 包裹 `fitz.open`
  - `rag_service.py`: 包裹 `collection.count()`，考虑缓存
- [ ] 修复会话双重提交（P0-3.2）
  - 移除 `conversations.py` 中手动 commit
  - 检查 `persist_node` 的 commit 行为
- [ ] 修复异常吞没（P0-3.3）
  - RAG service: 至少 `logger.debug`
  - Completion service: 添加日志
  - Main.py: MCP 挂载失败应 `logger.error`

### Phase 2: 提示词重构（1-2 天）

- [ ] 创建 `app/prompts/` 模块，集中所有提示词
- [ ] 统一提示词语言为英文
- [ ] 消除重复的提示词定义
- [ ] 将 API 层的 LLM 调用移到 service 层
  - `dedup.py:auto_resolve_conflict` → `DedupService.auto_resolve`
  - `keywords.py:expand_keywords` → `KeywordService.expand_keywords_with_llm`
- [ ] 改进每个提示词的质量（增加格式约束、语言动态化等）

### Phase 3: 架构优化（2-3 天）

- [ ] 添加分页到 keywords, subscriptions, tasks 端点
- [ ] 并行化 writing_service LLM 调用（`asyncio.gather`）
- [ ] 抽取 `get_resource_or_404` 通用依赖
- [ ] 修复 conversation 列表的内存过滤问题
- [ ] 健康检查端点免认证
- [ ] 硬编码配置移入 `config.py`
- [ ] 清理 `pyproject.toml` 未使用依赖

### Phase 4: 进阶改进（可选）

- [ ] 去重算法优化（MinHash/SimHash 替代 O(n²)）
- [ ] 添加 LLM 调用结果缓存
- [ ] 提示词版本化和 A/B 测试支持
- [ ] 用户自定义提示词功能

---

## 七、已解决问题

1. **提示词不需要支持用户自定义** — 开发者直接改代码即可，无需额外存储层
2. **提示词版本化暂不需要** — 以后再考虑
3. **去重 O(n²) 不是实际瓶颈** — 当前项目论文规模 < 500 篇，标记为低优先级
4. **Chat Pipeline 的 persist_node 手动 commit 确实有问题** — 经代码确认，`persist_node` 使用的 session 来自 `Depends(get_db)` → `get_session()`，后者在 yield 后自动 commit。因此 `persist_node:430` 的手动 `await db.commit()` 会导致双重提交，需要移除

## 八、剩余开放问题

1. **ChromaDB count() 缓存策略** — 缓存 TTL 多长合适？数据频繁变更时如何失效？建议：使用 TTL=60s 的简单内存缓存，index 操作后主动失效
