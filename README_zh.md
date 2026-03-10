# Omelette 🍳

**科研文献全生命周期管理系统**

Omelette 自动化完整流程：关键词管理 → 多源文献检索 → 去重 → PDF 爬取 → OCR → RAG 知识库 → 写作辅助。

**作者：** [Sylvan Ding](https://github.com/sylvanding)

---

## 功能模块

| 模块 | 说明 |
|------|------|
| **关键词** | 管理并扩展研究关键词，支持 LLM 辅助扩展 |
| **检索** | 多源文献检索（Semantic Scholar、arXiv、OpenAlex、Crossref） |
| **去重** | 三阶段去重：DOI → 标题相似度 → LLM 验证 |
| **爬虫** | 通过 Unpaywall、arXiv、直链下载 PDF |
| **OCR** | 从 PDF 提取文本（原生优先 + PaddleOCR 处理扫描件） |
| **RAG** | 构建与查询向量知识库（ChromaDB + LLM 生成回答） |
| **写作** | 摘要生成、引用格式化、综述大纲、研究差距分析 |
| **项目** | 按研究项目组织文献 |

---

## 快速开始

### 环境要求

- [Conda](https://docs.conda.io/) 或 Miniconda
- Node.js 22+
- （可选）CUDA，用于 GPU 加速 OCR 与嵌入
- （可选）API 密钥：阿里云百炼或火山引擎（LLM）；Semantic Scholar（提高速率限制）

### 1. 克隆并创建环境

```bash
git clone git@github.com:sylvanding/omelette.git
cd omelette

# 创建 conda 环境并安装所有后端依赖
conda env create -f environment.yml
conda activate omelette
```

### 2. 配置

```bash
cp .env.example .env
# 编辑 .env，填入 API 密钥和数据路径
```

### 3. 启动后端

```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

> **常见问题：** 如果报 `ModuleNotFoundError: No module named 'fastapi'`，请确认已激活 conda 环境：`conda activate omelette`。可用 `which uvicorn` 验证 — 应指向 conda 环境而非 `~/.local/bin/`。

### 4. 启动前端

```bash
cd frontend
npm install
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)。

### 5.（可选）OCR 与嵌入

完整 OCR 与嵌入支持：

```bash
cd backend
pip install -e ".[ocr,ml]"
```

---

## 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                       Omelette 流程                              │
├─────────────────────────────────────────────────────────────────┤
│  关键词 → 检索 → 去重 → 爬虫 → OCR → RAG → 写作                 │
└─────────────────────────────────────────────────────────────────┘
       │        │       │       │       │      │       │
       ▼        ▼       ▼       ▼       ▼      ▼       ▼
   [FastAPI] [数据源] [SQLite] [PDF] [Paddle] [Chroma] [LLM]
```

- **后端：** FastAPI + 异步 SQLAlchemy + Pydantic v2
- **前端：** React 18 + TypeScript + Vite + TailwindCSS v4
- **存储：** SQLite（元数据）、ChromaDB（向量）、文件系统（PDF）
- **LLM：** OpenAI 兼容接口（阿里云百炼、火山引擎豆包）

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | FastAPI、SQLAlchemy 2（异步）、Pydantic v2 |
| 前端 | React 18、Vite、TypeScript、TailwindCSS v4 |
| 数据库 | SQLite + aiosqlite |
| 向量库 | ChromaDB |
| OCR | PaddleOCR（可选） |
| LLM | OpenAI 兼容（阿里云百炼 / 火山引擎） |
| 嵌入 | BAAI/bge-m3 via sentence-transformers（可选） |

---

## 项目结构

```
omelette/
├── backend/              # FastAPI 应用
│   ├── app/
│   │   ├── api/v1/       # REST 接口
│   │   ├── models/       # SQLAlchemy ORM 模型
│   │   ├── schemas/      # Pydantic 请求/响应模式
│   │   ├── services/     # 业务逻辑（LLM、搜索、爬虫、OCR、RAG、写作）
│   │   ├── config.py     # 从 .env 加载配置
│   │   ├── database.py   # 异步引擎和会话
│   │   └── main.py       # 应用入口、生命周期、CORS
│   ├── tests/            # pytest-asyncio 测试（120+）
│   └── pyproject.toml    # Python 依赖（唯一来源）
├── frontend/             # React 单页应用
│   └── src/
│       ├── pages/        # Dashboard、ProjectDetail、各模块页面
│       ├── components/   # Layout、共享 UI
│       ├── services/     # 类型化 API 客户端
│       ├── stores/       # Zustand 状态
│       └── lib/          # Axios 客户端、工具函数
├── docs/                 # VitePress 文档站（中英双语）
├── environment.yml       # Conda 环境（Python 3.12 + pip install）
├── Makefile              # 开发工作流快捷命令
├── .env.example          # 配置模板
├── .pre-commit-config.yaml  # 代码质量检查钩子
└── .github/workflows/    # CI（ruff、pytest、tsc、build、文档部署）
```

---

## 开发

```bash
# 安装 pre-commit 钩子
make pre-commit-install

# 运行检查
make lint

# 自动格式化
make format

# 运行所有测试
make test

# 同时启动前后端
make dev
```

---

## 运行测试

```bash
# 后端（120+ 测试）
cd backend && pytest tests/ -v

# 前端类型检查和构建
cd frontend && npx tsc --noEmit && npm run build
```

---

## 配置说明

主要环境变量（参见 `.env.example`）：

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | SQLite 路径（默认：`sqlite:///./data/omelette.db`） |
| `DATA_DIR` | PDF、OCR 输出、ChromaDB 的根目录 |
| `LLM_PROVIDER` | `aliyun`、`volcengine` 或 `mock` |
| `ALIYUN_API_KEY` | 阿里云百炼 API 密钥 |
| `VOLCENGINE_API_KEY` | 火山引擎豆包 API 密钥 |
| `SEMANTIC_SCHOLAR_API_KEY` | 可选；提高 Semantic Scholar 速率限制 |

## API 概览

REST API 位于 `/api/v1/` 下：

- `GET/POST /projects` — 项目 CRUD
- `GET/POST /projects/{id}/papers` — 论文管理
- `GET/POST /projects/{id}/keywords` — 关键词管理
- `GET /projects/{id}/keywords/search-formula` — 生成检索式
- `POST /projects/{id}/search` — 执行多源检索
- `POST /projects/{id}/dedup/run` — 执行去重
- `POST /projects/{id}/crawl/start` — 启动 PDF 下载
- `POST /projects/{id}/ocr/process` — 执行 OCR
- `POST /projects/{id}/rag/index` — 构建向量索引
- `POST /projects/{id}/rag/query` — RAG 检索
- `POST /projects/{id}/writing/assist` — 写作辅助
- `GET /settings/health` — 健康检查

## 参与贡献

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

MIT License — 见 [LICENSE](LICENSE)。

## 名称由来

**Om**（Omni- 全）+ **Lit**（Literature 文献）= **Omlit** ≈ **Omelette** 🍳
