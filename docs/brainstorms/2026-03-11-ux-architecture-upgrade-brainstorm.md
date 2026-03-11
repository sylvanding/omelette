---
date: 2026-03-11
topic: ux-architecture-upgrade
---

# Omelette v2.0：用户体验与架构全面升级

## 我们要构建什么

将 Omelette 从「以项目为中心的工具集合」转型为「以聊天为中心的科研助手」。核心变化：

1. **ChatGPT 风格首页**——用户进入即可开始对话，选择知识库、工具模式，获得带引用的 AI 回答
2. **知识库管理中心**——创建/管理多个知识库（取代 Project 概念），支持关键词检索添加和 PDF 手动上传，去重冲突可视化解决
3. **MCP 协议支持**——让 Claude Code、Cursor、Claude Desktop 等工具直接调用 Omelette 的知识库检索和文献查找能力
4. **多模型支持**——OpenAI、Anthropic、阿里云百炼、火山引擎等，前端可切换
5. **现代 UI 重构**——shadcn/ui 组件库 + Vercel AI SDK 流式聊天 + react-markdown 富文本渲染

## 为什么选择这个方案

### 考虑过的方案

| 方案 | 描述 | 取舍 |
|------|------|------|
| **A: LlamaIndex + LangGraph（选中）** | LlamaIndex 做 RAG 数据层，LangGraph 做流程编排，MCP 做外部接入 | 最完整但复杂度高 |
| B: 纯 LlamaIndex | 所有功能在 LlamaIndex 生态内实现 | 简单但 HITL 和流程编排弱 |
| C: 保持现有架构 | 在现有 ChromaDB + 自定义服务上增量优化 | 无迁移成本但缺少高级特性 |

**选择方案 A 的理由：**
- LlamaIndex 在科研文献 RAG 场景极其成熟（PDF 解析、混合检索、增量索引、引用溯源原生支持）
- LangGraph 的 Human-in-the-Loop + 状态检查点天然适配去重冲突处理
- MCP 可以挂载到同一个 FastAPI 应用，零额外部署成本
- 这是 2025-2026 年 AI 应用开发的标准技术栈组合

## 关键决策

### 1. 产品架构：以聊天为核心入口

- **决策**：首页从项目列表变为 Playground 聊天界面
- **理由**：科研人员最高频的操作是「问问题」和「找文献」，聊天界面降低使用门槛
- **参考**：ChatGPT、Perplexity 的设计哲学

### 2. 概念重命名：Project → Knowledge Base（知识库）

- **决策**：将 Project 概念重命名为「知识库」，一个知识库保存一类论文
- **理由**：「知识库」更直观地表达了它的用途——一个可检索的文献集合
- **影响**：数据模型不变（Project 表），仅前端展示和 API 命名调整

### 3. 技术栈升级

| 层级 | 现有 | 升级为 | 理由 |
|------|------|--------|------|
| RAG 数据层 | 自定义 ChromaDB 集成 | LlamaIndex + ChromaDB | 混合检索、语义分块、增量索引、引用追踪 |
| 流程编排 | 手动 service 调用 | LangGraph StateGraph | HITL、状态检查点、流程可视化 |
| LLM 抽象 | 自定义 LLMClient | LangChain ChatModel | 统一多厂商接口（OpenAI/Anthropic/阿里云/火山引擎） |
| 外部接入 | 无 | MCP Server (FastMCP) | 让 Claude Code/Cursor 直接调用 |
| 前端 UI 库 | 自定义 Tailwind 组件 | shadcn/ui + Radix UI | 设计感强、可访问性好、维护成本低 |
| 聊天 SDK | 自定义 fetch | Vercel AI SDK (@ai-sdk/react) | useChat hook、流式渲染、模型切换 |
| Markdown 渲染 | 无 | react-markdown + remark-math + rehype-katex | 数学公式、代码高亮、引用卡片 |
| 动画 | 无 | Framer Motion | 消息进入/退出动画、页面切换 |

### 4. 多模型支持策略

| 提供商 | 集成方式 | 配置 |
|--------|----------|------|
| OpenAI | `ChatOpenAI` | OPENAI_API_KEY, OPENAI_MODEL |
| Anthropic | `ChatAnthropic` | ANTHROPIC_API_KEY, ANTHROPIC_MODEL |
| 阿里云百炼 | `ChatOpenAI(base_url=dashscope)` | ALIYUN_API_KEY, ALIYUN_MODEL |
| 火山引擎 | `ChatOpenAI(base_url=volcengine)` | VOLCENGINE_API_KEY, VOLCENGINE_MODEL |
| 本地模型 | `ChatOllama` | OLLAMA_BASE_URL, OLLAMA_MODEL |
| Mock | 内置 Mock | LLM_PROVIDER=mock |

### 5. 前端路由重构

```
/                        → Playground（聊天首页）
/knowledge-bases         → 知识库列表
/knowledge-bases/:id     → 知识库详情（论文管理、添加、订阅）
/knowledge-bases/:id/add → 添加论文（关键词检索/PDF上传）
/history                 → 对话历史
/settings                → 设置（模型选择、API Key 配置）
```

### 6. MCP 集成设计

```python
# 挂载到同一 FastAPI 应用
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("Omelette Literature Server", json_response=True)

@mcp.tool()
async def search_knowledge_base(query: str, kb_id: int, top_k: int = 5) -> str:
    """在指定知识库中搜索相关文献片段"""

@mcp.tool()
async def lookup_paper(doi: str = None, title: str = None) -> str:
    """按 DOI 或标题查找论文"""

@mcp.tool()
async def find_citations(text: str, kb_id: int) -> str:
    """为一段文本在知识库中找到可能的引用来源"""

@mcp.tool()
async def list_knowledge_bases() -> str:
    """列出所有可用的知识库"""

# FastAPI 主应用
app.mount("/mcp", mcp.http_app())
```

## 详细功能设计

### 功能 1：Playground 聊天首页

**交互参考**：ChatGPT 首页（见参考图）

**布局**：
- 左侧：窄图标侧边栏（首页、知识库、对话历史、设置）
- 中央：
  - 未开始对话时：欢迎语 + 聊天输入框 + 快捷模板卡片
  - 对话中：消息列表（上方）+ 输入框（底部固定）
- 输入框功能：
  - 知识库选择器（下拉，可多选）
  - 工具模式选择：普通问答（默认）| 引用查找 | 文献综述 | 研究空白分析
  - 附件上传（拖拽 PDF）
  - 引用开关（Citation toggle）
  - 模型选择（在输入框上方或设置中）

**AI 回答格式**：
- Markdown 渲染（支持表格、代码、列表）
- 数学公式（KaTeX）
- 内联引用标记 [1][2]，点击展开引用卡片（论文标题、作者、年份、DOI）
- 流式输出（SSE）

**快捷模板**：
- "帮我总结这个领域的研究现状"
- "找出这段文字的引用来源"
- "生成文献综述提纲"
- "分析当前研究空白"

### 功能 2：知识库管理

**知识库列表页**：
- 卡片式展示（名称、论文数、最后更新时间、标签）
- 新建知识库（名称、描述、领域标签）
- 搜索/筛选

**知识库详情页**：
- 论文列表（标题、作者、年份、状态标签）
- 索引统计（已索引/总数、chunk 数量）
- 订阅管理（活跃订阅列表、增量更新记录）

**添加论文 —— 两种模式**：

**模式 A：关键词检索添加**
1. 输入关键词（手动输入 OR 给主题让 AI 生成关键词）
2. 选择数据源（Semantic Scholar、OpenAlex、arXiv、Crossref）
3. 设置检索篇数上限（10-50，配置最大值）
4. 执行检索 → 展示结果预览
5. **去重冲突处理**：
   - 类似 git 冲突的左右对比界面
   - 每条冲突显示：旧记录 vs 新记录，高亮差异字段
   - 操作：保留旧的 | 保留新的 | 合并 | 跳过
   - 一键 AI 解决：LLM 判断是否真的重复，自动选择最优记录
6. 确认后入库 → 自动进入下载→OCR→索引流水线

**模式 B：手动 PDF 上传**
1. 拖拽或点击上传多个 PDF
2. LlamaIndex 提取元数据（标题、作者、DOI、摘要）
3. 自动检查重复（与知识库现有论文对比）
4. 冲突处理流程同上
5. 确认后直接进入 OCR→索引流水线

**订阅管理**：
- 为知识库添加多个订阅规则（关键词+数据源+频率）
- 增量更新时自动执行：检索→去重→下载→OCR→索引
- 可查看每次更新的新增论文

### 功能 3：对话历史

- 按时间排序的对话列表
- 每条对话显示：标题（AI 自动生成）、使用的知识库、时间
- 点击恢复对话上下文
- 可删除/重命名

### 功能 4：设置页

**模型配置**：
- 当前模型选择（下拉）
- 各提供商 API Key 输入（密码类型，可显示/隐藏）
- 连接测试按钮
- 高级参数（temperature、max_tokens）

**系统配置**：
- 数据存储路径
- 代理设置（HTTP_PROXY）
- 默认检索源
- 检索篇数上限

**说明**：所有设置同时支持 .env 文件配置和前端界面配置，前端配置优先级高于 .env

### 功能 5：补充功能（产品经理视角）

基于真实科研人需求的补充：

1. **PDF 在线预览**——在知识库详情中点击论文可预览 PDF，支持高亮标注
2. **导出功能**——导出引用格式（BibTeX、GB/T 7714、APA）、导出检索报告
3. **笔记功能**——每篇论文可添加笔记/标签，笔记也参与 RAG 检索
4. **研究进度看板**——可视化展示：已检索→已下载→已索引的漏斗图
5. **论文关系图谱**——基于引用关系的知识图谱可视化
6. **快捷键支持**——Cmd+K 快速搜索、Cmd+N 新建对话
7. **暗色模式**——深色/浅色主题切换
8. **多语言**——中英文界面切换（中文优先）
9. **WebSocket 实时进度**——长时间任务（检索、下载、OCR）的实时进度推送

## 技术架构图

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React 19)                      │
│  shadcn/ui + Vercel AI SDK + react-markdown + Framer Motion │
│  Zustand (UI) + TanStack Query (Server) + useChat (Chat)   │
├─────────────────────────────────────────────────────────────┤
│                           ↕ REST API + SSE                   │
├──────────────────────┬──────────────────────────────────────┤
│    FastAPI Backend    │         MCP Server                   │
│                      │    (mounted at /mcp)                  │
├──────────────────────┴──────────────────────────────────────┤
│                      Service Layer                           │
│  ┌─────────┐  ┌──────────┐  ┌─────────┐  ┌──────────────┐ │
│  │LangGraph│  │LlamaIndex│  │LangChain│  │   Existing    │ │
│  │ Workflow │  │  RAG     │  │ChatModel│  │  Services     │ │
│  │ Engine   │  │  Engine  │  │  Multi  │  │(search,dedup, │ │
│  │         │  │         │  │ Provider│  │crawler,ocr)  │ │
│  └────┬────┘  └────┬────┘  └────┬────┘  └──────┬───────┘ │
│       │            │            │               │          │
├───────┴────────────┴────────────┴───────────────┴──────────┤
│                      Data Layer                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐ │
│  │  SQLite  │  │ ChromaDB │  │PDF Store │  │  .env /    │ │
│  │(SQLAlchemy│  │(Vector)  │  │  (Local) │  │  Settings  │ │
│  │  async)  │  │          │  │          │  │  (DB)      │ │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 新增依赖

### 后端新增

```toml
# pyproject.toml 新增依赖
dependencies = [
    # LlamaIndex 核心
    "llama-index-core>=0.12",
    "llama-index-vector-stores-chroma>=0.4",
    "llama-index-embeddings-huggingface>=0.4",
    "llama-index-retrievers-bm25>=0.4",
    "llama-index-postprocessor-sentence-transformer-rerank>=0.3",
    # LangGraph 编排
    "langgraph>=0.4",
    "langchain-core>=0.3",
    "langchain-openai>=0.3",
    "langchain-anthropic>=0.3",
    # MCP
    "mcp>=1.26",
    # 现有依赖保留...
]
```

### 前端新增

```json
{
  "dependencies": {
    "@ai-sdk/react": "^5.0.0",
    "ai": "^5.0.0",
    "react-markdown": "^10.1.0",
    "remark-gfm": "^4.0.0",
    "remark-math": "^6.0.0",
    "rehype-katex": "^7.0.0",
    "rehype-highlight": "^7.0.0",
    "framer-motion": "^11.0.0",
    "katex": "^0.16.0"
  }
}
```

**shadcn/ui**：通过 CLI 安装，不是 npm 包依赖，组件直接复制到项目中。

## 数据模型变更

### 新增表

| 表名 | 说明 |
|------|------|
| **Conversation** | 对话历史：id, title, knowledge_base_ids, model, tool_mode, created_at, updated_at |
| **Message** | 消息：id, conversation_id, role (user/assistant/system), content, citations (JSON), created_at |
| **UserSettings** | 用户设置：id, key, value, updated_at（前端配置持久化） |

### 现有表调整

| 表 | 变更 |
|----|------|
| **Project** | 字段不变，前端展示为「知识库」，增加 `icon`, `color` 字段用于 UI 展示 |
| **Paper** | 增加 `notes` TEXT 字段（用户笔记） |

## 实施路线图

### Phase 1: 基础设施升级（1-2 周）
- [ ] 引入 shadcn/ui，初始化组件库
- [ ] 重构前端路由（Playground 首页）
- [ ] 引入 Vercel AI SDK + react-markdown
- [ ] 后端新增 Conversation/Message 模型和 API
- [ ] 后端引入 LangChain ChatModel 多模型支持
- [ ] 前端设置页（模型选择、API Key 配置）

### Phase 2: 聊天核心（1-2 周）
- [ ] Playground 聊天 UI（消息列表、流式输出、引用卡片）
- [ ] 知识库选择器 + 工具模式选择
- [ ] 后端 SSE 流式聊天 API
- [ ] 对话历史保存和恢复
- [ ] 引用溯源标注

### Phase 3: 知识库管理升级（1-2 周）
- [ ] 知识库列表页重构（卡片式）
- [ ] 论文添加流程（关键词检索 + PDF 上传双模式）
- [ ] 去重冲突可视化解决界面
- [ ] 一键 AI 去重
- [ ] 实时进度推送（WebSocket/SSE）

### Phase 4: LlamaIndex RAG 升级（1 周）
- [ ] 引入 LlamaIndex，替换现有 RAG 层
- [ ] 混合检索（Vector + BM25）
- [ ] 重排序（bge-reranker）
- [ ] 增量索引（添加/删除文档无需全量重建）
- [ ] 语义分块（SentenceSplitter / SemanticSplitter）

### Phase 5: LangGraph + MCP（1 周）
- [ ] LangGraph 编排：关键词检索→去重→下载→OCR→索引 流水线
- [ ] MCP Server 搭建（search_knowledge_base, lookup_paper, find_citations）
- [ ] MCP 连接测试（Claude Desktop / Cursor）

### Phase 6: 打磨与补充（持续）
- [ ] 暗色模式
- [ ] 多语言（中/英）
- [ ] PDF 在线预览
- [ ] 研究进度看板
- [ ] 快捷键
- [ ] 导出功能

## 开放问题

1. **Embedding 模型部署**——bge-m3 需要 GPU 或用 API（如阿里云/HuggingFace Inference）。当前环境是否有 GPU？如果没有，是否接受 API 调用？
2. **LlamaParse vs pdfplumber**——LlamaParse 对科研论文解析质量更高但有成本（免费 10K 页/月），是否使用？
3. **数据库迁移**——是否需要引入 Alembic 做正式的数据库迁移？
4. **多用户**——当前为单用户设计，未来是否需要考虑多用户？

## 下一步

→ 确认方向后，执行 `/workflows:plan` 生成详细实施计划并开始编码
