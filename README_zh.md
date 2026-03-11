<p align="center">
  <img src="assets/banner.png" alt="Omelette Banner" width="680" />
</p>

<p align="center">
  <strong>A full-stack Scientific Literature Lifecycle Management System</strong>
</p>

<p align="center">
  <a href="https://github.com/sylvanding/omelette/actions"><img src="https://img.shields.io/github/actions/workflow/status/sylvanding/omelette/ci.yml?branch=main&style=flat-square&logo=githubactions&logoColor=white&label=CI" alt="CI"></a>
  <a href="https://github.com/sylvanding/omelette/blob/main/LICENSE"><img src="https://img.shields.io/github/license/sylvanding/omelette?style=flat-square&color=blue" alt="License"></a>
  <a href="https://www.python.org/"><img src="https://img.shields.io/badge/python-3.12-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python 3.12"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-22+-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js 22+"></a>
  <a href="https://fastapi.tiangolo.com/"><img src="https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI"></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React_18-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 18"></a>
  <a href="https://sylvanding.github.io/omelette/"><img src="https://img.shields.io/badge/docs-VitePress-646CFF?style=flat-square&logo=vitepress&logoColor=white" alt="Docs"></a>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="https://sylvanding.github.io/omelette/">Documentation</a> ·
  <a href="#-快速开始">Quick Start</a> ·
  <a href="https://github.com/sylvanding/omelette/issues">Report Bug</a>
</p>

---

Omelette 覆盖科研文献全流程自动化 — 从关键词管理、多源检索、去重过滤、PDF 爬取，到 OCR 文本提取、RAG 知识库构建和 AI 写作辅助。V2 版本新增以对话为中心的用户体验、多厂商 LLM 支持、LangGraph 流水线编排，以及面向 AI IDE 客户端的 MCP 集成。

> **Om**（Omni- 全）+ **Lit**（Literature 文献）= **Omlit** ≈ **Omelette** 🍳

## ✨ 功能模块

<table>
<tr>
  <td width="50%">

  **🔑 关键词管理**
  三级关键词层级，LLM 智能扩展，自动生成 WOS、Scopus、PubMed 检索公式。

  **🔍 多源检索**
  联邦检索 Semantic Scholar、OpenAlex、arXiv、Crossref，统一标准化元数据。

  **🧹 智能去重**
  三阶段流水线：DOI 硬去重 → 标题相似度 → LLM 校验。

  **📡 增量订阅**
  RSS 与 API 定时更新，自动跟踪最新论文。

  **💬 对话式工作台**
  类 ChatGPT 对话界面，支持 RAG 检索与写作辅助。

  **🔌 多 LLM 支持**
  集成 LangChain，支持 OpenAI、Anthropic、阿里云、火山引擎、Ollama 等厂商。

  </td>
  <td width="50%">

  **📥 PDF 爬取**
  Unpaywall、arXiv、直链多通道下载，智能回退策略。

  **📝 OCR 解析**
  pdfplumber 原生文本提取，PaddleOCR GPU 加速处理扫描件。

  **🧠 RAG 知识库**
  LlamaIndex 引擎，ChromaDB 向量存储，GPU 感知嵌入，混合检索，带引用回答。

  **✍️ 写作辅助**
  论文摘要、引用生成（GB/T 7714、APA、MLA）、综述提纲、缺口分析。

  **🔄 LangGraph 流水线**
  流水线编排，支持人机协同中断与恢复。

  **🔗 MCP 集成**
  Model Context Protocol 服务端，面向 AI IDE 客户端（Cursor、Claude Code 等）。

  **🌐 国际化**
  中英双语界面，基于 shadcn/ui 与 Radix 组件。

  </td>
</tr>
</table>

## 🏗️ 架构概览

```
Keywords ─→ Search ─→ Dedup ─→ Crawler ─→ OCR ─→ RAG ─→ Writing
   │          │         │         │        │       │        │
   ▼          ▼         ▼         ▼        ▼       ▼        ▼
[LangChain] [Sources] [SQLite]  [PDFs]  [Paddle] [LlamaIndex] [LLM]
   │                                                      │
   └────────────────── LangGraph ─────────────────────────┘
   │
   └── MCP (Model Context Protocol) ──→ AI IDE clients
```

| 层级 | 技术 |
|------|------|
| **后端** | FastAPI、SQLAlchemy 2（异步）、Pydantic v2、Python 3.12 |
| **前端** | React 18、Vite、TypeScript、TailwindCSS v4、shadcn/ui、Radix |
| **数据库** | SQLite + aiosqlite，Alembic 迁移 |
| **向量库** | ChromaDB |
| **RAG** | LlamaIndex，GPU 感知嵌入 |
| **LLM** | LangChain（OpenAI、Anthropic、阿里云、火山引擎、Ollama） |
| **编排** | LangGraph，支持人机协同中断与恢复 |
| **OCR** | pdfplumber（原生）+ PaddleOCR（扫描件，可选） |
| **MCP** | Model Context Protocol 服务端 |
| **文档** | VitePress（中英双语） |

## 🚀 快速开始

### 环境要求

- [Conda](https://docs.conda.io/) 或 Miniconda
- Node.js 22+
- （可选）CUDA，用于 GPU 加速 OCR 与嵌入
- （可选）API 密钥：OpenAI、Anthropic、阿里云百炼或火山引擎（LLM）；Semantic Scholar（提高速率限制）

### 1. 克隆并创建环境

```bash
git clone git@github.com:sylvanding/omelette.git
cd omelette

# Create conda env and install all backend dependencies
conda env create -f environment.yml
conda activate omelette
```

### 2. 配置

```bash
cp .env.example .env
# Edit .env with your API keys and data paths
```

<details>
<summary><strong>主要环境变量</strong></summary>

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | SQLite 路径（默认：`sqlite:///./data/omelette.db`） |
| `DATA_DIR` | PDF、OCR 输出、ChromaDB 的根目录 |
| `LLM_PROVIDER` | `openai`、`anthropic`、`aliyun`、`volcengine`、`ollama` 或 `mock` |
| `OPENAI_API_KEY` | OpenAI API 密钥 |
| `ANTHROPIC_API_KEY` | Anthropic API 密钥 |
| `ALIYUN_API_KEY` | 阿里云百炼 API 密钥 |
| `VOLCENGINE_API_KEY` | 火山引擎豆包 API 密钥 |
| `SEMANTIC_SCHOLAR_API_KEY` | 可选；提高 Semantic Scholar 速率限制 |

详见 [`.env.example`](.env.example)。

</details>

### 3. 启动后端

```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 4. 启动前端

```bash
cd frontend
npm install
npm run dev
```

在浏览器中打开 [http://localhost:3000](http://localhost:3000)。

### 5.（可选）OCR 与嵌入

```bash
cd backend
pip install -e ".[ocr,ml]"
```

> **常见问题：** 若出现 `ModuleNotFoundError: No module named 'fastapi'`，请确认已激活 conda 环境：`conda activate omelette`。

## 📂 项目结构

```
omelette/
├── backend/              # FastAPI application
│   ├── app/
│   │   ├── api/v1/       # REST endpoints
│   │   ├── models/       # SQLAlchemy ORM models
│   │   ├── schemas/      # Pydantic request/response schemas
│   │   ├── services/     # Business logic
│   │   ├── pipelines/    # LangGraph pipeline definitions
│   │   ├── config.py     # Settings from .env
│   │   ├── database.py   # Async engine and session
│   │   └── main.py       # App entry, lifespan, CORS
│   ├── mcp_server.py     # MCP (Model Context Protocol) server
│   ├── alembic/          # Database migrations
│   ├── tests/            # pytest-asyncio tests (178)
│   └── pyproject.toml    # Python dependencies
├── frontend/             # React SPA
│   └── src/
│       ├── pages/        # Dashboard, ProjectDetail, Chat, modules
│       ├── components/   # Layout, shared UI
│       │   └── ui/       # shadcn/ui components
│       ├── services/     # Typed API client
│       ├── stores/       # Zustand state
│       ├── i18n/         # Internationalization (zh/en)
│       └── lib/          # Axios client, utils
├── docs/                 # VitePress documentation (EN/ZH)
├── assets/               # Banner, logo, mascot images
├── environment.yml       # Conda env (Python 3.12)
├── Makefile              # Dev workflow shortcuts
├── .env.example          # Configuration template
└── .github/workflows/    # CI (ruff, pytest, tsc, build, docs)
```

## 🛠️ 开发

```bash
make pre-commit-install   # Install pre-commit hooks
make lint                 # Run linters
make format               # Auto-format code
make test                 # Run all tests
make dev                  # Start both backend and frontend
```

### 运行测试

```bash
# Backend (178 tests)
cd backend && pytest tests/ -v

# Frontend type check and build
cd frontend && npx tsc --noEmit && npm run build
```

## 📡 API 概览

REST API 位于 `/api/v1/` 下：

| 接口 | 说明 |
|------|------|
| `GET/POST /projects` | 项目 CRUD |
| `GET/POST /projects/{id}/papers` | 论文管理 |
| `GET/POST /projects/{id}/keywords` | 关键词管理 |
| `GET /projects/{id}/keywords/search-formula` | 生成检索式 |
| `POST /projects/{id}/search` | 执行多源检索 |
| `POST /projects/{id}/dedup/run` | 执行去重 |
| `POST /projects/{id}/crawl/start` | 启动 PDF 下载 |
| `POST /projects/{id}/ocr/process` | 执行 OCR |
| `POST /projects/{id}/rag/index` | 构建向量索引 |
| `POST /projects/{id}/rag/query` | RAG 检索 |
| `POST /projects/{id}/writing/assist` | 写作辅助 |
| `POST /chat` | 对话消息（工作台） |
| `GET/POST /conversations` | 会话 CRUD |
| `GET/POST /pipelines` | 流水线管理 |
| `GET/POST /subscriptions` | 订阅管理 |
| `GET/POST /settings` | 设置与健康状态 |
| `GET /settings/health` | 健康检查 |

MCP 服务端：`/mcp`（WebSocket/SSE，面向 AI IDE 客户端）

完整文档：[API 参考](https://sylvanding.github.io/omelette/api/)

## 🤝 参与贡献

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 📄 许可证

[MIT License](LICENSE) — Copyright © 2026 [Sylvan Ding](https://github.com/sylvanding)
