---
title: "feat: 知识库管理与去重冲突处理"
type: feat
status: active
date: 2026-03-11
origin: docs/brainstorms/2026-03-11-ux-architecture-upgrade-brainstorm.md
---

# 知识库管理与去重冲突处理计划

## 1. Overview

### 愿景

将 Omelette 的「项目」概念升级为「知识库」，打造以知识库为中心的文献管理体验。用户可创建多个知识库，通过**关键词检索**或**PDF 手动上传**两种方式添加论文，在添加过程中遇到重复时，通过**类 git 的左右对比界面**可视化解决冲突，并支持**一键 AI 解决**。每个知识库可配置多个**订阅规则**，实现增量文献更新。

### 关键决策（来自头脑风暴）

| 决策 | 说明 |
|------|------|
| Project 重命名为「知识库」 | 数据模型不变（Project 表），仅展示层和 API 别名调整 |
| 两种添加模式 | 关键词检索 + PDF 手动上传 |
| 去重冲突处理 | 类 git 左右对比界面 + 一键 AI 解决 |
| 检索篇数上限 | 可配置最大值（测试阶段 10-50 篇） |
| 订阅管理 | 每个知识库可有多个订阅规则 |

### 当前状态

- **后端**：Project CRUD、Paper CRUD、Search、Dedup、Subscription API 已完整实现
- **去重**：DOI 硬去重 + 标题相似度 + LLM 辅助，但前端无去重 UI
- **文献添加**：后端支持手动添加和批量导入，前端有基本 PapersPage
- **缺失**：无 PDF 上传功能；Subscription 有后端 API 但无前端 UI

---

## 2. Technical Approach

### 2.1 API 变更

#### 2.1.1 知识库别名路由

- **新增**：`/api/v1/knowledge-bases` → 映射到 projects 路由
- **实现**：在 `main.py` 或 `api_router` 中挂载 projects 路由的副本，使用 `prefix="/knowledge-bases"`，内部复用相同 handler
- **子路由**：`/api/v1/knowledge-bases/{id}/papers`、`/keywords`、`/search` 等均通过 alias 暴露

#### 2.1.2 新增端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/knowledge-bases/{id}/papers/upload` | PDF 上传，multipart/form-data |
| POST | `/api/v1/knowledge-bases/{id}/papers/search-and-add` | 关键词检索添加（异步任务） |
| GET | `/api/v1/knowledge-bases/{id}/dedup/preview` | 去重预览，返回冲突对列表 |
| POST | `/api/v1/knowledge-bases/{id}/dedup/resolve` | 解决单条冲突（指定保留/合并/跳过） |
| POST | `/api/v1/knowledge-bases/{id}/dedup/auto-resolve` | AI 自动解决全部或指定冲突 |

#### 2.1.3 Subscription API 扩展

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/knowledge-bases/{id}/subscriptions` | 订阅规则列表 |
| POST | `/api/v1/knowledge-bases/{id}/subscriptions` | 创建订阅规则 |
| GET | `/api/v1/knowledge-bases/{id}/subscriptions/{sub_id}` | 获取订阅规则 |
| PUT | `/api/v1/knowledge-bases/{id}/subscriptions/{sub_id}` | 更新订阅规则 |
| DELETE | `/api/v1/knowledge-bases/{id}/subscriptions/{sub_id}` | 删除订阅规则 |
| GET | `/api/v1/knowledge-bases/{id}/subscriptions/{sub_id}/history` | 执行历史 |
| POST | `/api/v1/knowledge-bases/{id}/subscriptions/{sub_id}/trigger` | 手动触发更新 |

---

### 2.2 PDF 上传流程

#### 前端

1. 拖拽或点击上传多个 PDF 文件
2. 使用 `multipart/form-data` 调用 `POST /knowledge-bases/{id}/papers/upload`
3. 后端返回 task_id，前端轮询或 WebSocket 获取进度
4. 完成后返回：已解析论文列表 + 冲突对列表
5. 若有冲突，进入去重冲突 UI；否则直接确认入库

#### 后端

1. 接收 PDF 文件，保存到 `PDF_DIR`（配置项）
2. 使用 pdfplumber（或 LlamaIndex）提取元数据：标题、作者、DOI、摘要
3. 与知识库现有论文做去重检查（DOI 精确匹配 + 标题相似度）
4. 返回：`{ papers: [...], conflicts: [...] }`，conflicts 为冲突对列表
5. 用户解决冲突后，调用 resolve/auto-resolve，再入库
6. 入库后触发 OCR → 索引流水线

#### 元数据提取

- **标题**：从 PDF 首页提取，或 metadata
- **作者**：metadata 或首页解析
- **DOI**：metadata 或正文正则匹配
- **摘要**：首段或 Abstract 段落

---

### 2.3 关键词检索添加流程

| 步骤 | 用户操作 | 系统行为 |
|------|----------|----------|
| 1 | 输入关键词（手动 OR AI 生成） | 可选：调用 LLM 扩展关键词 |
| 2 | 选择数据源 + 篇数上限 | 数据源：Semantic Scholar、OpenAlex、arXiv、Crossref；上限：10-50（可配置） |
| 3 | 点击「开始检索」 | 异步任务，返回 task_id |
| 4 | 轮询任务状态 | 检索完成 → 返回结果预览 |
| 5 | 自动去重检查 | 与知识库现有论文对比，生成冲突对 |
| 6 | 用户解决冲突 | 去重冲突 UI |
| 7 | 确认入库 | 批量创建 Paper 记录 |
| 8 | 自动流水线 | 下载 → OCR → 索引 |

#### API 设计

- `POST /knowledge-bases/{id}/papers/search-and-add`
  - Body: `{ query: string, sources?: string[], max_results: number }`
  - Response: `{ task_id: number }`
- 轮询 `GET /tasks/{task_id}` 获取进度
- 任务完成后 result 包含：`{ papers: [...], conflicts: [...] }`
- 用户解决冲突后，调用 `POST /knowledge-bases/{id}/dedup/resolve` 或 `auto-resolve`
- 最后调用 `POST /knowledge-bases/{id}/papers/bulk` 入库（或由 resolve 自动完成）

---

### 2.4 去重冲突 UI（核心交互）

#### 布局

- **冲突列表**：左侧「旧记录」/ 右侧「新记录」并排展示
- **差异高亮**：不同字段用颜色标注（如标题、作者、DOI）
- **操作按钮**：保留旧的 | 保留新的 | 合并 | 跳过（两个都保留）

#### 操作说明

| 操作 | 含义 |
|------|------|
| 保留旧的 | 删除新记录，保留知识库中已有记录 |
| 保留新的 | 用新记录替换旧记录（删除旧记录，入库新记录） |
| 合并 | 取两记录最完整元数据合并为一条 |
| 跳过 | 两个都保留，不视为重复 |

#### 一键 AI 解决

- 调用 LLM 判断是否真的重复
- LLM 返回：`{ is_duplicate: bool, keep: "old"|"new"|"merge", reason: string }`
- 支持：单条 AI 解决、全部 AI 解决

#### 批量操作

- 全部保留旧的
- 全部保留新的
- 全部 AI 解决

---

### 2.5 知识库列表页

- **卡片式展示**：图标、颜色标签、名称、论文数、最后更新时间
- **搜索/筛选**：按名称、领域搜索
- **创建知识库**：对话框（名称、描述、领域、可选 icon/color）
- **操作**：编辑、删除、进入详情

---

### 2.6 知识库详情页

- **Tab 结构**：论文列表 | 订阅管理 | 设置（可选）
- **论文列表**：表格展示，列：标题、作者、年份、状态、操作
- **状态标签**：pending、metadata_only、pdf_downloaded、ocr_complete、indexed、error
- **索引统计**：已索引/总数、chunk 数量
- **添加论文按钮**：弹出模式选择（关键词检索 | PDF 上传）
- **订阅管理 Tab**：订阅规则 CRUD、执行历史、手动触发

---

### 2.7 订阅管理

- **订阅规则**：关键词 + 数据源 + 频率（每日/每周/每月）
- **CRUD**：创建、编辑、删除订阅规则
- **执行历史**：每次更新的时间、新增论文数
- **手动触发**：立即执行一次更新

---

## 3. Implementation Phases

| Phase | 内容 | 预估 |
|-------|------|------|
| **Phase 1** | 知识库列表页重构（卡片式 + CRUD） | 1 周 |
| **Phase 2** | PDF 上传 API + 前端上传 UI | 1 周 |
| **Phase 3** | 关键词检索添加流程（向导式 UI） | 1 周 |
| **Phase 4** | 去重冲突处理界面 | 1 周 |
| **Phase 5** | 一键 AI 去重 | 0.5 周 |
| **Phase 6** | 订阅管理 UI | 1 周 |
| **Phase 7** | 自动流水线触发 | 0.5 周 |

### Phase 1 明细

- 后端：`/api/v1/knowledge-bases` alias 路由
- 前端：`/knowledge-bases` 路由，卡片式列表页
- 创建/编辑/删除知识库对话框
- Project 模型增加 `icon`、`color` 字段（若尚未有）

### Phase 2 明细

- 后端：`POST /papers/upload`，pdfplumber 元数据提取
- 前端：拖拽上传组件，进度展示
- 去重检查逻辑（复用 DedupService）

### Phase 3 明细

- 后端：`POST /papers/search-and-add` 异步任务
- 前端：向导式 UI（步骤 1-7）
- 检索篇数上限配置

### Phase 4 明细

- 后端：`GET /dedup/preview`、`POST /dedup/resolve`
- 前端：左右对比冲突界面，差异高亮，操作按钮

### Phase 5 明细

- 后端：`POST /dedup/auto-resolve`，批量调用 LLM
- 前端：一键 AI 解决按钮，批量操作

### Phase 6 明细

- 后端：Subscription 模型 + CRUD API
- 前端：订阅规则列表、创建/编辑表单、执行历史、手动触发

### Phase 7 明细

- 入库后自动触发：crawl → ocr → index
- 订阅定时任务（可选，或由外部 cron 触发）

---

## 4. Dedup Conflict Data Model

### 4.1 冲突对结构（DedupConflictPair）

```python
# 用于 API 响应，非持久化表
class DedupConflictPair(BaseModel):
    """单条冲突对"""
    conflict_id: str  # 前端用于标识，如 "a-1_b-2"
    old_paper: PaperRead  # 知识库中已有记录
    new_paper: PaperRead | dict  # 待添加的新记录（可能尚未入库，无 id）
    reason: str  # "doi_duplicate" | "title_similarity" | "llm_candidate"
    similarity: float | None  # 标题相似度，0-1
```

### 4.2 去重预览响应

```python
class DedupPreviewResponse(BaseModel):
    conflicts: list[DedupConflictPair]
    total_conflicts: int
    new_papers_count: int  # 无冲突的新论文数
```

### 4.3 解决冲突请求

```python
class ResolveConflictRequest(BaseModel):
    conflict_id: str
    action: Literal["keep_old", "keep_new", "merge", "skip"]
    # merge 时可选：指定合并后的字段覆盖
    merged_paper: dict | None = None

class AutoResolveRequest(BaseModel):
    conflict_ids: list[str] | None = None  # None = 全部
```

### 4.4 冲突对生成逻辑

- **PDF 上传**：新解析的论文 vs 知识库现有论文，按 DOI 或标题相似度匹配
- **关键词检索**：检索结果 vs 知识库现有论文，同上
- **复用**：`DedupService.doi_hard_dedup`、`title_similarity_dedup`、`find_llm_dedup_candidates` 的输出格式需适配为 `DedupConflictPair` 列表

---

## 5. Acceptance Criteria

### 5.1 知识库列表

- [ ] `/knowledge-bases` 展示卡片式知识库列表
- [ ] 每个卡片显示：图标、颜色、名称、论文数、最后更新时间
- [ ] 支持按名称搜索
- [ ] 创建知识库对话框可输入名称、描述、领域
- [ ] 编辑、删除知识库功能正常

### 5.2 PDF 上传

- [ ] 支持拖拽和点击上传多个 PDF
- [ ] 上传后显示解析进度
- [ ] 解析完成展示元数据预览
- [ ] 若有冲突，进入去重冲突界面
- [ ] 确认后论文入库，并触发 OCR → 索引

### 5.3 关键词检索添加

- [ ] 向导式流程：关键词 → 数据源+篇数 → 检索 → 预览 → 去重 → 入库
- [ ] 支持 AI 生成关键词（可选）
- [ ] 篇数上限可配置，默认 50
- [ ] 检索为异步任务，有进度反馈
- [ ] 入库后自动触发下载 → OCR → 索引

### 5.4 去重冲突界面

- [ ] 左右对比展示旧记录 vs 新记录
- [ ] 差异字段高亮
- [ ] 四个操作按钮：保留旧的、保留新的、合并、跳过
- [ ] 单条 AI 解决可用
- [ ] 批量操作：全部保留旧/新、全部 AI 解决
- [ ] 解决后冲突从列表移除，可继续处理下一批

### 5.5 订阅管理

- [ ] 订阅规则列表展示
- [ ] 创建订阅：关键词、数据源、频率
- [ ] 编辑、删除订阅
- [ ] 执行历史列表
- [ ] 手动触发更新按钮可用

### 5.6 API 兼容

- [ ] `/api/v1/knowledge-bases` 与 `/api/v1/projects` 行为一致
- [ ] 现有前端调用 `/projects` 可逐步迁移至 `/knowledge-bases`

---

## 6. Wireframes：去重冲突界面

### 6.1 整体布局

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  去重冲突 (3 条)                                    [全部保留旧] [全部保留新] [全部 AI 解决] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  冲突 1/3  相似度: 0.92  原因: 标题相似                                        │
│  ┌──────────────────────────────┬──────────────────────────────┐           │
│  │ 已有记录 (知识库中)             │ 新记录 (待添加)               │           │
│  ├──────────────────────────────┼──────────────────────────────┤           │
│  │ 标题: Deep Learning for NLP   │ 标题: Deep Learning for       │           │
│  │       [相同]                  │       Natural Language       │           │
│  │                              │       Processing [差异]        │           │
│  │ 作者: Zhang et al.           │ 作者: Zhang, Li, Wang [差异]   │           │
│  │ DOI: 10.1234/abc             │ DOI: 10.1234/abc [相同]        │           │
│  │ 年份: 2023                   │ 年份: 2023 [相同]             │           │
│  │ 状态: indexed                │ 状态: -                       │           │
│  └──────────────────────────────┴──────────────────────────────┘           │
│  [保留旧的] [保留新的] [合并] [跳过] [AI 解决]                                 │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  冲突 2/3  ...                                                               │
│  ...                                                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  无冲突的新论文: 12 篇                                                        │
│  [确认入库]                                                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 差异高亮规则

- `[相同]`：绿色背景或勾选图标
- `[差异]`：黄色背景或高亮
- 缺失字段：灰色斜体

### 6.3 合并操作展开

当用户点击「合并」时，可展开表单让用户选择每个字段取「旧」或「新」：

```
  合并选项:
  标题:   ( ) 旧  (•) 新
  作者:   (•) 旧  ( ) 新
  DOI:    (•) 旧  ( ) 新  （若两者都有且相同则自动选中）
  摘要:   ( ) 旧  (•) 新
  [应用合并]
```

### 6.4 移动端简化

- 上下堆叠而非左右并排
- 操作按钮可折叠为「更多」菜单
