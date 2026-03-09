# Omelette PRD — Product Requirements Document

## 1. Product Overview / 产品概述

**Name / 产品名称**：Omelette

**Vision / 产品愿景**：全生命周期科研文献管理系统 —— 从关键词检索到 RAG 驱动的写作辅助，覆盖文献发现、获取、解析、索引与知识复用的完整链路。Full lifecycle scientific literature management — from keyword search to RAG-powered writing assistance.

**Target Users / 目标用户**：
- 科研人员（Researchers）：需要系统性跟踪领域前沿、撰写论文与基金申请
- 博士研究生（PhD students）：开题、文献综述、论文写作
- 基金申请人（Grant applicants）：撰写研究背景、文献支撑、创新点论证

**Core Pain Points / 核心痛点**：
- **文献检索不完整**：单一数据源覆盖有限，关键词体系混乱，难以保证召回率
- **工作流割裂**：检索、去重、下载、OCR、索引分散在多个工具，缺乏统一入口
- **知识复用差**：已读文献难以结构化沉淀，写作时无法快速引用与对比
- **前沿跟踪滞后**：缺乏增量订阅机制，新论文发现依赖人工定期检索

**Product Principles / 产品原则**：
- 本地优先：数据存储于用户本地，无云端依赖，保护隐私
- 模块解耦：各模块可独立使用，支持渐进式采用
- 可测试性：Mock 模式支持无 API Key 的完整流程验证

---

## 2. Core Modules / 核心模块

### Module 1: Keyword Management / 关键词体系管理

**Description / 描述**：三级关键词层级（核心词、子领域词、扩展词），支持 LLM 驱动的关键词扩展与多数据库检索公式生成。

**User Stories / 用户故事**：
- 作为研究者，我希望按项目维护一套结构化的关键词体系，以便系统化检索文献
- 作为研究者，我希望基于核心词自动扩展同义词与相关术语，以减少漏检
- 作为研究者，我希望系统为 Semantic Scholar、OpenAlex、arXiv、Crossref 等数据源生成适配的检索公式

**Acceptance Criteria / 验收标准**：
- [ ] 支持三级层级（level 1=core, 2=sub-domain, 3=expanded），可设置 parent_id 建立树形结构
- [ ] 关键词支持中英文（term, term_en）、同义词列表（synonyms）、分类（category）
- [ ] 提供 LLM 关键词扩展接口，输入核心词返回扩展词列表
- [ ] 提供检索公式生成接口，输出各数据源可用的布尔/高级检索字符串
- [ ] Mock 模式下扩展接口返回预设示例，不调用真实 LLM

**Technical Notes / 技术说明**：Keyword 模型通过 `level` 与 `parent_id` 实现树形结构；检索公式生成需考虑各 API 的查询语法差异（如 Semantic Scholar 的 `query` 参数、OpenAlex 的 filter 语法）。

---

### Module 2: Multi-Source Literature Search / 多源文献检索

**Description / 描述**：联邦检索 Semantic Scholar、OpenAlex、arXiv、Crossref，统一元数据 schema，支持金标准召回率验证。

**User Stories / 用户故事**：
- 作为研究者，我希望一次检索即可覆盖多个学术数据库，减少重复操作
- 作为研究者，我希望检索结果统一为标准化元数据（标题、作者、DOI、摘要、年份等），便于后续处理
- 作为研究者，我希望对金标准文献集进行召回率验证，评估检索质量

**Acceptance Criteria / 验收标准**：
- [ ] 支持 Semantic Scholar、OpenAlex、arXiv、Crossref 等数据源（可配置）
- [ ] 统一输出 schema：title, abstract, authors, doi, year, source, source_id, citation_count
- [ ] 检索为异步任务，返回 task_id，支持进度查询
- [ ] 支持金标准集（gold standard）召回率计算与报告
- [ ] 检索结果按项目存储，支持增量去重

**Technical Notes / 技术说明**：各数据源 API 需封装为统一适配器；Semantic Scholar 需 API Key 以提升限流；arXiv 使用 `http://export.arxiv.org/api/query`；Crossref 使用 REST API。

---

### Module 3: Deduplication / 去重与噪声过滤

**Description / 描述**：DOI 硬去重、标题规范化 + 相似度去重、LLM 辅助精确去重。

**User Stories / 用户故事**：
- 作为研究者，我希望系统自动去除重复文献（同一篇论文在不同数据源出现），避免重复阅读
- 作为研究者，我希望对无 DOI 的文献通过标题相似度进行去重
- 作为研究者，我希望在边界模糊时由 LLM 辅助判断是否同一篇文献

**Acceptance Criteria / 验收标准**：
- [ ] DOI 完全匹配时优先硬去重，保留一条记录
- [ ] 标题规范化：去除标点、大小写、空格差异，支持相似度阈值（如 Jaccard、编辑距离）
- [ ] 提供 LLM 辅助去重接口，输入候选对返回是否重复的判断
- [ ] 去重任务为异步，支持进度与结果统计
- [ ] 提供去重候选预览接口，供用户确认后再执行

**Technical Notes / 技术说明**：去重顺序建议 DOI → 标题相似度 → LLM；合并时保留最完整元数据（如优先保留有 abstract 的记录）。

---

### Module 4: Incremental Subscription / 增量订阅

**Description / 描述**：基于 API/RSS 的定时更新，新论文自动进入处理流水线。

**User Stories / 用户故事**：
- 作为研究者，我希望按项目订阅关键词/作者/期刊的更新，自动获取新论文
- 作为研究者，我希望新论文自动进入去重、下载、OCR、索引流程，无需手动触发

**Acceptance Criteria / 验收标准**：
- [ ] 支持基于关键词的定时检索（如 Semantic Scholar、arXiv API）
- [ ] 支持 RSS 订阅（如 arXiv 分类订阅）
- [ ] 新论文自动去重后并入项目 Paper 表
- [ ] 可配置调度频率（cron 或间隔）
- [ ] 订阅任务可查看历史执行记录与新增论文数

**Technical Notes / 技术说明**：可使用 APScheduler 或 Celery Beat 实现定时任务；RSS 解析使用 feedparser；新论文触发后自动进入 crawl → ocr → index 流水线。

---

### Module 5: PDF Crawling / PDF 爬取

**Description / 描述**：按优先级下载 PDF，Unpaywall 优先，多通道回退，完整性校验。

**User Stories / 用户故事**：
- 作为研究者，我希望系统自动为已收录的文献下载 PDF，优先使用合法开放获取渠道
- 作为研究者，我希望下载失败时自动尝试其他来源（如出版社直链、预印本）
- 作为研究者，我希望下载完成后校验文件完整性，避免损坏文件

**Acceptance Criteria / 验收标准**：
- [ ] 优先使用 Unpaywall API 获取 OA 链接
- [ ] 支持多通道回退：Unpaywall → 预印本（arXiv）→ 其他（可配置）
- [ ] 支持按优先级队列（如 citation_count、年份）批量下载
- [ ] 下载完成后校验 PDF 可读性（如页数、首字节）
- [ ] 爬取为异步任务，支持进度与失败重试

**Technical Notes / 技术说明**：Unpaywall 需配置 `unpaywall_email`；PDF 存储路径为 `{data_dir}/pdfs/{project_id}/{doi_or_source_id}.pdf`；支持断点续传与并发限制。

---

### Module 6: OCR Processing / OCR 解析

**Description / 描述**：优先 pdfplumber 提取文本层，扫描版 PDF 使用 PaddleOCR GPU，输出结构化内容（章节、表格、公式）。

**User Stories / 用户故事**：
- 作为研究者，我希望系统自动提取 PDF 文本，支持可复制文本与扫描版
- 作为研究者，我希望提取结果保留章节结构、表格、公式，便于后续 RAG 分块
- 作为研究者，我希望扫描版 PDF 使用 GPU 加速 OCR，提高处理速度

**Acceptance Criteria / 验收标准**：
- [ ] 优先使用 pdfplumber 提取已有文本层，无文本层时回退 PaddleOCR
- [ ] PaddleOCR 支持 GPU 加速（CUDA）
- [ ] 输出结构化内容：chunk_type（text/table/formula/figure_caption）、section、page_number
- [ ] OCR 为异步任务，支持进度与失败重试
- [ ] 解析结果存储为 PaperChunk，关联 paper_id

**Technical Notes / 技术说明**：pdfplumber 适用于数字版 PDF；PaddleOCR 通过 `cuda_visible_devices` 配置 GPU；输出目录为 `{data_dir}/ocr_output/{project_id}/`。

---

### Module 7: RAG Knowledge Base / RAG 知识库

**Description / 描述**：语义分块 + 父子设计，bge-m3 向量 + ChromaDB，混合检索（向量 + BM25）+ 重排序。

**User Stories / 用户故事**：
- 作为研究者，我希望将已解析论文构建为可检索的知识库，支持语义搜索
- 作为研究者，我希望检索时结合向量相似度与关键词匹配，提高召回质量
- 作为研究者，我希望对检索结果进行重排序，优先返回最相关片段

**Acceptance Criteria / 验收标准**：
- [ ] 分块策略：语义分块，支持父子 chunk 设计（父块保留上下文）
- [ ] 使用 bge-m3 生成 embedding，存储至 ChromaDB
- [ ] 混合检索：向量检索 + BM25 关键词检索
- [ ] 支持 bge-reranker 重排序
- [ ] 提供检索接口：输入 query，返回 top-k 相关 chunk 及来源 paper
- [ ] 索引接口：按项目批量或增量构建/更新向量索引

**Technical Notes / 技术说明**：ChromaDB 按 project 隔离 collection；bge-m3 支持多语言；分块大小建议 256–512 tokens，重叠 50 tokens；父子设计便于检索时返回更大上下文。

---

### Module 8: Writing Assistance / 写作辅助

**Description / 描述**：文献推荐、引用格式生成（GB/T 7714、APA）、综述提纲生成、研究空白分析。

**User Stories / 用户故事**：
- 作为研究者，我希望按写作主题推荐相关文献，便于补充引用
- 作为研究者，我希望系统为选中文献生成 GB/T 7714、APA 等标准引用格式
- 作为研究者，我希望基于知识库生成综述提纲或研究空白分析，辅助写作

**Acceptance Criteria / 验收标准**：
- [ ] 文献推荐：基于 RAG 检索或 LLM 推荐，返回与主题相关的论文列表
- [ ] 引用格式：支持 GB/T 7714、APA 等标准，输入 paper 列表输出格式化引用
- [ ] 综述提纲：基于项目知识库生成结构化提纲（章节、要点）
- [ ] 研究空白分析：基于已有文献生成潜在研究空白与方向建议
- [ ] 所有 LLM 调用支持 Mock 模式

**Technical Notes / 技术说明**：写作辅助通过 `app/services/llm_client.py` 统一调用；引用格式需严格遵循国标与 APA 规范；综述提纲可结合 RAG 检索结果与 LLM 生成。

---

## 3. Non-Functional Requirements / 非功能性需求

| 需求项 | 说明 |
|--------|------|
| **单用户多项目** | 支持多项目隔离，每个项目独立管理关键词、文献、任务 |
| **本地存储** | 数据文件存储于本地文件系统（如 `/data0/djx/omelette/`），数据库默认 SQLite |
| **LLM Mock 模式** | 配置 `llm_provider=mock` 时，所有 LLM 调用返回预设结果，无需 API Key |
| **响应式 Web UI** | 前端适配桌面与平板，支持常见分辨率 |
| **异步任务** | 检索、去重、爬取、OCR、索引等耗时操作使用 Task 模型跟踪，支持取消与进度查询 |

---

## 4. API Design / 接口设计

**Base URL**：`/api/v1`

**Response Format**：
```json
{
  "code": 200,
  "message": "success",
  "data": {},
  "timestamp": "2025-03-10T12:00:00.000Z"
}
```

**Paginated Response**：`data` 为 `{ "items": [], "total": N, "page": 1, "page_size": 20, "total_pages": M }`

**Error Response**：`code` 非 2xx 时，`message` 为错误描述，`data` 可为 null 或包含 `detail` 字段。

**Key Endpoints**：

| Method | Path | Description |
|--------|------|-------------|
| **项目** | | |
| GET | `/projects` | 分页获取项目列表 |
| POST | `/projects` | 创建新项目 |
| GET | `/projects/{project_id}` | 获取单个项目详情 |
| PUT | `/projects/{project_id}` | 更新项目信息 |
| DELETE | `/projects/{project_id}` | 删除项目 |
| **文献** | | |
| GET | `/projects/{project_id}/papers` | 分页获取项目文献 |
| POST | `/projects/{project_id}/papers` | 手动添加文献 |
| POST | `/projects/{project_id}/papers/bulk` | 批量导入文献 |
| GET | `/projects/{project_id}/papers/{paper_id}` | 获取文献详情 |
| PUT | `/projects/{project_id}/papers/{paper_id}` | 更新文献 |
| DELETE | `/projects/{project_id}/papers/{paper_id}` | 删除文献 |
| **关键词** | | |
| GET | `/projects/{project_id}/keywords` | 获取项目关键词 |
| POST | `/projects/{project_id}/keywords` | 添加关键词 |
| POST | `/projects/{project_id}/keywords/bulk` | 批量导入关键词 |
| PUT | `/projects/{project_id}/keywords/{keyword_id}` | 更新关键词 |
| DELETE | `/projects/{project_id}/keywords/{keyword_id}` | 删除关键词 |
| POST | `/projects/{project_id}/keywords/expand` | LLM 扩展关键词 |
| **检索** | | |
| POST | `/projects/{project_id}/search/execute` | 触发多源检索 |
| GET | `/projects/{project_id}/search/sources` | 获取可用检索源 |
| **去重** | | |
| POST | `/projects/{project_id}/dedup/run` | 触发去重任务 |
| GET | `/projects/{project_id}/dedup/candidates` | 获取去重候选预览 |
| **爬取** | | |
| POST | `/projects/{project_id}/crawl/start` | 触发 PDF 下载 |
| GET | `/projects/{project_id}/crawl/stats` | 获取爬取统计 |
| **OCR** | | |
| POST | `/projects/{project_id}/ocr/process` | 触发 OCR 解析 |
| GET | `/projects/{project_id}/ocr/stats` | 获取 OCR 统计 |
| **RAG** | | |
| POST | `/projects/{project_id}/rag/query` | 语义检索 |
| POST | `/projects/{project_id}/rag/index` | 构建/更新向量索引 |
| GET | `/projects/{project_id}/rag/stats` | 获取索引统计 |
| **写作** | | |
| POST | `/projects/{project_id}/writing/assist` | 文献推荐/提纲/空白分析 |
| POST | `/projects/{project_id}/writing/summarize` | 论文摘要 |
| POST | `/projects/{project_id}/writing/citations` | 生成引用格式 |
| **任务** | | |
| GET | `/tasks` | 获取任务列表 |
| GET | `/tasks/{task_id}` | 获取任务状态与结果 |
| POST | `/tasks/{task_id}/cancel` | 取消进行中任务 |
| **设置** | | |
| GET | `/settings` | 获取应用配置 |
| GET | `/settings/health` | 服务健康状态 |

---

## 5. Data Model / 数据模型

| 表名 | 说明 |
|------|------|
| **Project** | 项目：id, name, description, domain, settings, created_at, updated_at |
| **Paper** | 文献：id, project_id, doi, title, abstract, authors, journal, year, citation_count, source, source_id, pdf_path, pdf_url, status, tags, notes, extra_metadata, created_at, updated_at |
| **Keyword** | 关键词：id, project_id, term, term_en, level, category, parent_id, synonyms, created_at |
| **PaperChunk** | 文献分块：id, paper_id, chunk_type, content, section, page_number, chunk_index, chroma_id, token_count, created_at |
| **Task** | 任务：id, project_id, task_type, status, params, result, error_message, progress, total, created_at, started_at, completed_at |

**PaperStatus**：`pending` → `metadata_only` → `pdf_downloaded` → `ocr_complete` → `indexed` | `error`

**TaskType**：`search`, `dedup`, `crawl`, `ocr`, `index`, `keyword_expand`

**TaskStatus**：`pending` → `running` → `completed` | `failed` | `cancelled`

**ChunkType**：`text`, `table`, `formula`, `figure_caption`

**ER 关系**：Project 1:N Paper, Project 1:N Keyword, Project 1:N Task；Paper 1:N PaperChunk；Keyword 自关联 parent_id。

---

## 6. Tech Stack / 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 后端 | Python 3.12 | 主语言 |
| 后端 | FastAPI | Web 框架 |
| 后端 | SQLAlchemy 2.0 (async) | ORM |
| 后端 | SQLite | 默认数据库 |
| 后端 | Pydantic v2 | 数据校验与序列化 |
| 后端 | ChromaDB | 向量数据库 |
| 后端 | bge-m3 | 嵌入模型 |
| 后端 | bge-reranker-v2-m3 | 重排序模型 |
| 后端 | pdfplumber | PDF 文本提取 |
| 后端 | PaddleOCR | 扫描版 PDF OCR |
| 后端 | OpenAI SDK | LLM 调用（兼容多厂商） |
| 后端 | httpx / aiohttp | 异步 HTTP |
| 前端 | React 18 | UI 框架 |
| 前端 | TypeScript | 类型安全 |
| 前端 | Vite | 构建工具 |
| 前端 | TailwindCSS v4 | 样式 |
| 前端 | TanStack Query | 数据请求 |
| 前端 | Zustand | 状态管理 |
| 部署 | 本地 | 单机运行，数据存储于本地 |

---

## 7. Milestones / 里程碑

### Phase 0: Foundation（基础架构）
- [ ] 项目骨架：FastAPI + SQLite + 前端 React 项目
- [ ] 数据模型：Project, Paper, Keyword, PaperChunk, Task
- [ ] 基础 CRUD：项目、文献、关键词
- [ ] 统一 API 响应格式与错误处理
- [ ] 配置与 Mock 模式支持
- [ ] 前端：Dashboard、项目详情、文献列表、关键词管理
- [ ] 后端：Alembic 迁移、Pydantic 校验、CORS 配置

### Phase 1: Search & Dedup（检索与去重）
- [ ] 关键词管理：三级层级、LLM 扩展、检索公式生成
- [ ] 多源检索：Semantic Scholar、OpenAlex、arXiv、Crossref 等
- [ ] 去重：DOI 硬去重、标题相似度、LLM 辅助
- [ ] 异步任务框架与进度查询
- [ ] 前端：检索触发、任务进度展示、去重候选确认
- [ ] 金标准召回率验证工具

### Phase 2: PDF & OCR（获取与解析）
- [ ] PDF 爬取：Unpaywall 优先、多通道回退
- [ ] OCR 流水线：pdfplumber + PaddleOCR
- [ ] 增量订阅：定时检索、RSS 订阅
- [ ] 前端：爬取/OCR 进度、PDF 预览、解析结果查看
- [ ] 优先级队列与并发控制

### Phase 3: RAG & Knowledge（知识库）
- [ ] 语义分块与父子 chunk 设计
- [ ] ChromaDB 索引：bge-m3 + 混合检索 + 重排序
- [ ] RAG 检索接口与统计
- [ ] 前端：知识库检索 UI、索引构建进度、检索结果展示
- [ ] 增量索引与索引重建

### Phase 4: Writing & Polish（写作与打磨）
- [ ] 写作辅助：文献推荐、引用格式、综述提纲、研究空白
- [ ] 响应式 UI 完善
- [ ] 端到端流程测试与文档

---

## 8. Appendix / 附录

### 8.1 Error Codes / 错误码约定
| Code | 说明 |
|------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 |
| 404 | 资源不存在 |
| 422 | 校验失败（Pydantic） |
| 500 | 服务器内部错误 |

### 8.2 Environment Variables / 环境变量
| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | 数据库连接（默认 sqlite） |
| `LLM_PROVIDER` | aliyun / volcengine / mock |
| `ALIYUN_API_KEY` | 阿里云百炼 API Key |
| `VOLCENGINE_API_KEY` | 火山引擎 API Key |
| `SEMANTIC_SCHOLAR_API_KEY` | Semantic Scholar API Key |
| `UNPAYWALL_EMAIL` | Unpaywall 联系邮箱 |
| `DATA_DIR` | 数据根目录 |

### 8.3 Glossary / 术语表
| 术语 | 说明 |
|------|------|
| 金标准 | Gold standard，用于评估检索召回率的已知相关文献集 |
| OA | Open Access，开放获取 |
| RAG | Retrieval-Augmented Generation，检索增强生成 |
| 父子 chunk | 子块为检索单元，父块保留更大上下文用于展示 |
| 联邦检索 | Federated search，多数据源并行检索并合并结果 |

### 8.4 Data Flow / 数据流概览
```
关键词 → 检索 → 原始结果 → 去重 → Paper(metadata_only)
  → 爬取 → Paper(pdf_downloaded) → OCR → PaperChunk
  → 索引 → ChromaDB → RAG 检索 → 写作辅助
```

### 8.5 Out of Scope / 不在本期范围
- 多用户与权限管理
- 云端同步与备份
- 移动端原生 App
- 与 Zotero/Mendeley 的导入导出（可后续扩展）

---

*Document Version: 1.0 | Last Updated: 2025-03-10*
