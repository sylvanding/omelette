# Omelette V3 PRD — 设置与集成模块

> 版本：V3.0 Draft | 日期：2026-03-15 | 状态：规划中

## 1. 模块概述

设置与集成模块负责：**多模型 LLM 管理**、**Zotero 集成**、**系统配置**。本 PRD 从产品侧定义功能、交互与验收标准，技术实现参考 `docs/plans/2026-03-11-feat-multi-model-llm-settings-plan.md`。

### 1.1 与现有架构的关系

- **后端**：`UserSettingsService`、`UserSettings` 表、`LLMClient` + LangChain 工厂
- **前端**：`SettingsPage` 已有 Provider/模型选择、API Key、连接测试
- **配置优先级**：DB 覆盖 .env；请求时 `model` 参数可覆盖默认

### 1.2 模块边界

| 子模块 | 状态 | 说明 |
|--------|------|------|
| 多模型 LLM 管理 | V2 已有，V3 增强 | Provider 切换、模型选择、连接测试、任务级模型 |
| Zotero 集成 | V3 新增 | 文库导入、可选双向同步 |
| 系统配置 | V2 已有 | 数据目录、Embedding、代理等只读/受限编辑 |

---

## 2. 多模型 LLM 管理

### 2.1 产品目标

科研场景下，用户需按任务选择不同模型：

- **成本敏感**：关键词扩展、去重用经济型；综述、深度问答用高能力模型
- **合规与隐私**：机构要求使用国产云或本地 Ollama
- **能力对比**：研究者希望对比不同模型在引用生成、理解上的表现
- **可用性**：单一 Provider 故障时快速切换备用

### 2.2 功能清单

| 功能 | 描述 | 验收标准 |
|------|------|----------|
| Provider 选择 | 支持 OpenAI、Anthropic、阿里云、火山引擎、Ollama、Mock | 下拉选择，保存后持久化 |
| 模型选择 | 每个 Provider 对应模型列表，可切换 | 模型列表来自 `GET /api/v1/settings/models` |
| API Key 配置 | 各 Provider 的 Key、Base URL（如需要） | 密码框、脱敏展示、保存时完整写入 |
| 连接测试 | 一键验证当前配置是否可用 | 显示成功/失败及错误信息 |
| 高级参数 | temperature、max_tokens | 可编辑，有合理默认值 |
| 全局模型切换 | 在 Playground/聊天输入框旁显示当前模型，支持切换 | 切换后新请求使用新模型 |
| 任务级模型（可选） | 某些任务可指定模型（如写作用 Claude） | 请求体可带 `model` 覆盖 |

### 2.3 交互设计

#### 2.3.1 设置页布局

```
┌─────────────────────────────────────────────────────────┐
│ 设置                                                    │
├─────────────────────────────────────────────────────────┤
│ LLM 配置                                                 │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Provider: [阿里云百炼 ▼]  模型: [qwen3.5-plus ▼]    │ │
│ │ API Key:  [••••••••••••••••••••]  [显示] [测试连接]  │ │
│ │ Base URL: [https://dashscope...] (可选)              │ │
│ │ 高级: temperature [0.7]  max_tokens [4096]          │ │
│ └─────────────────────────────────────────────────────┘ │
│ [保存]                                                   │
├─────────────────────────────────────────────────────────┤
│ 系统配置（只读/受限）                                     │
│ 数据目录、Embedding 模型、代理等                          │
└─────────────────────────────────────────────────────────┘
```

#### 2.3.2 全局模型切换器

- **位置**：Playground 顶部或聊天输入框上方
- **形态**：下拉或徽章，显示当前 `Provider / 模型`，点击可切换
- **行为**：切换后写入 UserSettings 或会话状态，后续请求携带新模型

#### 2.3.3 连接测试

- **触发**：点击「测试连接」按钮
- **请求**：`POST /api/v1/settings/test-connection`
- **反馈**：Loading → 成功（绿色 + 简短响应示例）或 失败（红色 + 错误信息）
- **限流**：同一 IP 每分钟最多 5 次（后端实现）

### 2.4 配置合并规则

| 优先级（从低到高） | 来源 |
|-------------------|------|
| 1 | 代码默认值 |
| 2 | .env 文件 |
| 3 | DB UserSettings |
| 4 | 请求时显式传入的 `provider`、`model` |

**规则**：DB 中非空值覆盖 .env；API Key 若为脱敏值（含 `***`），保存时跳过，不覆盖真实 Key。

### 2.5 安全与隐私

| 项 | 说明 |
|----|------|
| API Key 存储 | 单用户本地部署可明文存 DB；多用户场景需加密 |
| 前端脱敏 | 返回格式 `sk-xxxx***xxxx`，仅前 4 + 后 4 位 |
| 连接测试 | 仅发送无害 prompt（如 "Hi"），不记录 |

---

## 3. Zotero 集成

### 3.1 产品目标

- **复用 Zotero 文库**：用户已有大量文献在 Zotero，希望导入到 Omelette 做 RAG、对话、写作辅助
- **不替代 Zotero**：Omelette 专注智能分析，文献管理仍以 Zotero 为主
- **可选双向同步**：在 Omelette 中新增的标注、笔记可写回 Zotero（Phase 2）

### 3.2 集成方式

Zotero 提供 **Web API** 与 **本地 SQLite** 两种访问方式：

| 方式 | 优点 | 缺点 |
|------|------|------|
| Web API | 官方支持、跨平台、支持群组 | 需 API Key、有速率限制、无法直接读附件 |
| 本地 SQLite | 无网络、可读附件路径 | 需 Zotero 安装路径、数据库格式可能变更 |

**建议**：优先支持 **Web API**，后续可增加本地 SQLite 作为补充（用于读取附件路径）。

### 3.3 功能清单

| 功能 | 描述 | 验收标准 |
|------|------|----------|
| Zotero 连接配置 | 输入 API Key、User ID 或 Group ID | 保存到 UserSettings，支持测试连接 |
| 文库/集合选择 | 选择要导入的 Zotero 集合（Collection） | 树形选择，支持多选 |
| 一键导入 | 将选中集合的文献元数据导入 Omelette 项目 | 创建 Paper 记录，状态为 metadata_only |
| 附件同步（可选） | 若 Zotero 有 PDF 附件，可同步路径或下载 | Phase 2；需处理 Zotero 存储结构 |
| 双向同步（可选） | Omelette 中的笔记、标签写回 Zotero | Phase 2；需 Zotero Items API 写权限 |

### 3.4 用户故事

| ID | 角色 | 需求 | 验收标准 |
|----|------|------|----------|
| Z1 | 科研人员 | 将 Zotero 中某项目的文献导入 Omelette | 选择集合 → 导入 → 项目中出现对应 Paper |
| Z2 | 科研人员 | 导入时自动去重（与现有 Paper 比对 DOI/标题） | 重复文献不重复创建，可提示 |
| Z3 | 科研人员 | 导入后自动触发爬取、OCR、索引 | 可选「导入后自动建库」 |
| Z4 | 科研人员 | 配置错误时能明确提示 | 测试连接返回具体错误信息 |

### 3.5 交互设计

#### 3.5.1 设置页 — Zotero 配置

```
┌─────────────────────────────────────────────────────────┐
│ Zotero 集成                                              │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ API Key:  [••••••••••••••••••••]  [显示] [测试连接]  │ │
│ │ User/Group ID: [12345678]                             │ │
│ └─────────────────────────────────────────────────────┘ │
│ [保存]                                                   │
└─────────────────────────────────────────────────────────┘
```

- **API Key**：从 [zotero.org/settings/keys](https://www.zotero.org/settings/keys) 创建，需 `library:read` 权限
- **User/Group ID**：个人文库为 User ID；群组文库为 Group ID，可从 Zotero 群组 URL 获取

#### 3.5.2 知识库/项目页 — 从 Zotero 导入

```
┌─────────────────────────────────────────────────────────┐
│ 从 Zotero 导入                                            │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 选择集合:                                            │ │
│ │ ☑ My Library                                        │ │
│ │   ☑ 项目A/子集合1                                    │ │
│ │   ☐ 项目A/子集合2                                    │ │
│ │   ☑ 项目B                                            │ │
│ │                                                     │ │
│ │ ☐ 导入后自动建库（爬取 PDF、OCR、索引）               │ │
│ └─────────────────────────────────────────────────────┘ │
│ [导入]                                                   │
└─────────────────────────────────────────────────────────┘
```

- **导入**：异步任务，返回 task_id，可查进度
- **去重**：按 DOI 优先，无 DOI 按标题相似度

### 3.6 数据流

```
Zotero API (collections/items)
    → 获取 items 元数据（title, authors, DOI, year, ...）
    → 去重（与项目 Paper 比对）
    → 创建 Paper(metadata_only)
    → [可选] 触发 crawl → ocr → index
```

### 3.7 技术要点

| 项 | 说明 |
|----|------|
| Zotero API | `GET /users/{userId}/collections`、`GET /users/{userId}/items`，支持 `collection` 过滤 |
| 速率限制 | 每用户 100 请求/分钟（Zotero 限制），需客户端限流 |
| 附件 | Web API 可获取 attachment 的 URL，但部分需认证；本地 SQLite 可读 `storage` 路径 |
| 错误处理 | 401 未授权、404 无权限、429 超限，需明确提示 |

### 3.8 预留空间

- **Better BibTeX citekey**：若 Zotero 安装 BBT，可通过 API 获取 extra 字段中的 citekey，便于 LaTeX 用户
- **双向同步**：Omelette 的 Paper.notes、tags 写回 Zotero item notes、tags
- **增量同步**：定时检测 Zotero 集合变更，增量更新 Omelette

---

## 4. 系统配置

### 4.1 只读/受限项

| 配置项 | 说明 | 是否可编辑 |
|--------|------|:----------:|
| data_dir | 数据根目录 | 仅 .env |
| pdf_dir, ocr_output_dir, chroma_db_dir | 子目录 | 仅 .env |
| embedding_model | 嵌入模型 | 仅 .env |
| reranker_model | 重排序模型 | 仅 .env |
| cuda_visible_devices | GPU 设备 | 仅 .env |
| semantic_scholar_api_key | S2 API Key | 可编辑（Settings） |
| unpaywall_email | Unpaywall 邮箱 | 可编辑（Settings） |
| http_proxy | 代理 | 仅 .env |

### 4.2 展示方式

- 设置页「系统配置」区域以只读形式展示
- 敏感项（API Key）脱敏
- 提供「从 .env 重新加载」说明（修改 .env 后需重启服务）

---

## 5. API 设计

### 5.1 已有接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/settings` | 获取合并后配置（脱敏） |
| PUT | `/api/v1/settings` | 更新配置 |
| GET | `/api/v1/settings/models` | 获取可用 Provider 及模型列表 |
| POST | `/api/v1/settings/test-connection` | 测试 LLM 连接 |

### 5.2 Zotero 相关接口（新增）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/settings/test-zotero` | 测试 Zotero 连接 |
| GET | `/api/v1/zotero/collections` | 获取 Zotero 集合树（需先配置 Key） |
| POST | `/api/v1/projects/{id}/papers/import-zotero` | 从 Zotero 导入文献到项目 |

**请求示例**：

```json
POST /api/v1/projects/1/papers/import-zotero
{
  "collection_keys": ["ABC123", "DEF456"],
  "auto_index": true
}
```

**响应**：返回 `task_id`，可通过 `GET /api/v1/tasks/{task_id}` 查询进度。

---

## 6. 验收标准汇总

### 6.1 多模型管理

- [ ] 设置页可编辑 Provider、模型、各 Provider 的 API Key、Base URL
- [ ] 保存后刷新页面，配置仍生效
- [ ] 连接测试按钮可触发测试并显示成功/失败
- [ ] 高级参数（temperature、max_tokens）可编辑
- [ ] Playground 有模型选择器，可切换当前模型
- [ ] 模型切换后，新请求使用新模型

### 6.2 Zotero 集成

- [ ] 设置页可配置 Zotero API Key、User/Group ID
- [ ] 测试 Zotero 连接可验证配置
- [ ] 项目页可发起「从 Zotero 导入」，选择集合后导入
- [ ] 导入时按 DOI/标题去重
- [ ] 可选「导入后自动建库」触发爬取、OCR、索引

### 6.3 端到端

- [ ] 仅配置 .env 时，系统行为与当前一致
- [ ] 通过前端配置后，无需重启服务即可生效
- [ ] 连接测试失败时，用户能明确看到错误信息

---

## 7. 实施顺序建议

| 阶段 | 内容 | 预估 |
|------|------|------|
| Phase 1 | 多模型管理前端完善（模型选择器、连接测试优化） | 1 周 |
| Phase 2 | Zotero 连接配置 + 测试接口 | 0.5 周 |
| Phase 3 | Zotero 集合获取 + 导入接口 + 前端导入 UI | 1 周 |
| Phase 4 | 导入后自动建库、去重优化 | 0.5 周 |

---

*本文档为设置与集成模块的产品设计，技术实现见 `docs/plans/` 及后端 API 文档。*
