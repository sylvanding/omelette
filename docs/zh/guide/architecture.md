# 系统架构

## 概览

Omelette 采用流水线架构，数据按顺序流经各模块：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Omelette 流水线                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  Keywords → Search → Dedup → Crawler → OCR → RAG → Writing                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 对话与 RAG 流程

对话与 RAG 子系统采用分层架构：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           对话与 RAG 架构                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  Chat UI → LLM (LangChain) → RAG (LlamaIndex) → Vector Store (ChromaDB)     │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Chat UI** — React 前端，支持对话历史
- **LLM** — LangChain 负责对话编排（OpenAI、Anthropic、阿里云、火山引擎、Ollama、mock）
- **RAG** — LlamaIndex 负责检索增强生成与混合检索
- **Vector Store** — ChromaDB 存储向量与语义检索

## LangGraph 流水线编排

文献导入由 **LangGraph** 流水线编排：

- **检索流水线**：`search → dedup → [有冲突时 HITL] → apply_resolution → import → crawl → ocr → index`
- **上传流水线**：`extract_metadata → dedup → [有冲突时 HITL] → apply_resolution → import → ocr → index`

两条流水线均支持条件分支：去重发现冲突时，会进入人机协同（HITL）步骤，人工确认后再导入项目。

## MCP 集成

Omelette 提供 **MCP（Model Context Protocol）** 服务端，供 AI IDE 连接：

- **Streamable HTTP**：后端启动后挂载于 `/mcp`，可从 Claude Code、Codex、Cursor 通过 `http://host:port/mcp` 连接
- **Tools**：`search_knowledge_base`、`lookup_paper`、`add_paper_by_doi` 等
- **Resources**：项目元数据、论文详情
- **Prompts**：文献综述、引用查找等预定义模板

连接方法见 [快速开始](./getting-started#mcp-usage)。

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | FastAPI、SQLAlchemy 2（异步）、Pydantic v2 |
| 前端 | React 19、Vite 7、TypeScript、Tailwind CSS、shadcn/ui |
| 数据库 | SQLite、Alembic（迁移） |
| 向量库 | ChromaDB |
| OCR | PaddleOCR |
| LLM | LangChain（OpenAI、Anthropic、阿里云、火山引擎、Ollama、mock） |
| RAG | LlamaIndex |
| 流水线 | LangGraph |
| 编排 | MCP（Model Context Protocol） |
| 嵌入 | BAAI/bge-m3（sentence-transformers） |

## 目录结构

```
omelette/
├── backend/              # FastAPI 应用
│   ├── app/
│   │   ├── api/v1/       # REST 接口
│   │   ├── models/       # SQLAlchemy 模型
│   │   ├── schemas/      # Pydantic 模式
│   │   ├── services/     # 业务逻辑
│   │   ├── pipelines/    # LangGraph 流水线定义
│   │   ├── mcp_server.py # MCP 服务端（tools、resources、prompts）
│   │   └── main.py
│   ├── alembic/          # 数据库迁移
│   └── tests/
├── frontend/             # React SPA
│   └── src/
│       ├── pages/        # Dashboard、ProjectDetail、Settings
│       ├── components/   # 布局、共享 UI（shadcn/ui）
│       ├── stores/       # Zustand 状态
│       └── lib/          # API 客户端、工具
├── docs/                 # VitePress 文档
├── environment.yml
├── .env.example
└── .github/workflows/
```
