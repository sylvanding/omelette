# Omelette 🍳

**科研文献全生命周期管理系统**

Omelette 自动化完整流程：关键词管理 → 多源文献检索 → 去重 → PDF 爬取 → OCR → RAG 知识库 → 写作辅助。

**作者：** [Sylvan Ding](https://github.com/sylvanding)

---

## 功能模块

| 模块 | 说明 |
|------|------|
| **关键词** | 管理并扩展研究关键词，支持 LLM 辅助扩展 |
| **检索** | 多源文献检索（Semantic Scholar、arXiv、RSS 等） |
| **去重** | 跨来源文献去重 |
| **爬虫** | 从开放获取源爬取并下载 PDF |
| **OCR** | 从 PDF 提取文本（PaddleOCR 处理扫描件） |
| **RAG** | 构建与查询向量知识库（ChromaDB + 嵌入模型） |
| **写作** | LLM 写作辅助、摘要生成、引用生成 |
| **项目** | 按研究项目组织文献 |

---

## 快速开始

### 环境要求

- [Conda](https://docs.conda.io/) 或 Miniconda
- Node.js 22+
- （可选）CUDA，用于 GPU 加速 OCR 与嵌入
- （可选）API 密钥：阿里云百炼或火山引擎（LLM）；Semantic Scholar（提高检索限速）

### 1. 克隆并创建环境

```bash
git clone git@github.com:sylvanding/omelette.git
cd omelette
conda env create -f environment.yml
conda activate omelette
```

### 2. 配置

```bash
cp .env.example .env
# 编辑 .env，填入 API 密钥（LLM、Semantic Scholar 等）
```

### 3. 后端

```bash
cd backend
pip install -e ".[dev]"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 4. 前端

```bash
cd frontend
npm install
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)。

### 可选：OCR 与嵌入

完整 OCR 与嵌入支持需安装可选依赖：

```bash
conda activate omelette
cd backend
pip install -e ".[ocr,ml]"
```

- **OCR：** PaddleOCR（建议使用 `paddlepaddle-gpu`）
- **嵌入：** sentence-transformers + BAAI/bge-m3（首次使用自动下载）

---

## 架构概览

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Omelette 流程                                  │
├─────────────────────────────────────────────────────────────────────────┤
│  关键词 → 检索 → 去重 → 爬虫 → OCR → RAG → 写作                         │
└─────────────────────────────────────────────────────────────────────────┘
         │         │       │        │       │     │        │
         ▼         ▼       ▼        ▼       ▼     ▼        ▼
    [FastAPI]  [数据源] [SQLite] [PDF] [Paddle] [Chroma] [LLM]
```

- **后端：** FastAPI + 异步 SQLAlchemy、Pydantic v2、依赖注入
- **前端：** React + Vite + TanStack Query + Zustand
- **存储：** SQLite（元数据）、ChromaDB（向量）、文件系统（PDF、OCR 输出）
- **LLM：** OpenAI 兼容接口（阿里云百炼、火山引擎豆包）

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | FastAPI、SQLAlchemy 2（异步）、Pydantic v2 |
| 前端 | React 19、Vite 7、TypeScript、Tailwind CSS |
| 数据库 | SQLite |
| 向量库 | ChromaDB |
| OCR | PaddleOCR |
| LLM | OpenAI 兼容（阿里云百炼 / 火山引擎） |
| 嵌入 | BAAI/bge-m3（sentence-transformers） |

---

## 项目结构

```
omelette/
├── backend/              # FastAPI 应用
│   ├── app/
│   │   ├── api/v1/       # REST 接口（keywords, search, dedup, crawler, ocr, rag, writing）
│   │   ├── models/       # SQLAlchemy 模型（Project, Paper, Keyword, Task 等）
│   │   ├── schemas/      # Pydantic 请求/响应模式
│   │   ├── services/    # LLM 客户端，未来：search、crawler、OCR 服务
│   │   └── main.py       # 应用入口、生命周期、CORS
│   └── tests/
├── frontend/             # React 单页应用
│   └── src/
│       ├── pages/        # Dashboard、ProjectDetail、Settings
│       ├── components/   # Layout、共享 UI
│       ├── stores/       # Zustand 状态（projects 等）
│       └── lib/          # API 客户端、工具函数
├── environment.yml       # Conda 环境
├── .env.example          # 配置模板
└── .github/workflows/    # CI（ruff、mypy、pytest、tsc、build）
```

---

## 参与贡献

详见 [CONTRIBUTING.md](CONTRIBUTING.md)，包含开发环境、代码规范与 PR 流程。

---

## 许可证

MIT License — 见 [LICENSE](LICENSE)。

---

## 配置说明

主要环境变量（参见 `.env.example`）：

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | SQLite 路径（默认：`sqlite:///./data/omelette.db`） |
| `LLM_PROVIDER` | `aliyun`、`volcengine` 或 `mock` |
| `ALIYUN_API_KEY` | 阿里云百炼 API 密钥 |
| `VOLCENGINE_API_KEY` | 火山引擎豆包 API 密钥 |
| `EMBEDDING_MODEL` | HuggingFace 嵌入模型（如 `BAAI/bge-m3`） |
| `DATA_DIR` | PDF、OCR 输出、ChromaDB 的根目录 |
| `SEMANTIC_SCHOLAR_API_KEY` | 可选；提高 Semantic Scholar 限速 |

## API 概览

后端在 `/api/v1/` 下提供 REST API：

- `GET/POST /projects` — 项目 CRUD
- `GET/POST /projects/{id}/keywords` — 关键词管理
- `POST /projects/{id}/keywords/expand` — LLM 关键词扩展
- `POST /projects/{id}/search` — 执行文献检索
- `POST /projects/{id}/dedup` — 去重
- `POST /projects/{id}/crawl` — 启动 PDF 爬取
- `POST /projects/{id}/ocr` — 对论文执行 OCR
- `POST /projects/{id}/rag/build` — 构建向量索引
- `POST /projects/{id}/rag/query` — RAG 检索
- `POST /projects/{id}/writing/assist` — 写作辅助
- `GET /tasks/{id}` — 查询异步任务状态

## 运行测试

```bash
# 后端
cd backend && pytest tests/ -v

# 前端
cd frontend && npx tsc --noEmit && npm run build
```

## 数据持久化

- **SQLite：** 数据库路径由 `DATABASE_URL` 指定（默认：`./data/omelette.db`）
- **ChromaDB：** 向量库路径由 `CHROMA_DB_DIR` 指定（默认：`{DATA_DIR}/chroma_db`）
- **PDF 与 OCR：** 分别存储在 `PDF_DIR` 和 `OCR_OUTPUT_DIR`

运行爬虫或 OCR 前请确保 `DATA_DIR` 存在且可写。

## 名称由来

**Om**（Omni- 全）+ **Lit**（Literature 文献）= **Omlit** ≈ **Omelette** 🍳
