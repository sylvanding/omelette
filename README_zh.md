<p align="center">
  <img src="assets/banner.png" alt="Omelette Banner" width="680" />
</p>

<p align="center">
  <strong>全栈科研文献全生命周期管理系统</strong>
</p>

<p align="center">
  <a href="https://github.com/sylvanding/omelette/actions"><img src="https://img.shields.io/github/actions/workflow/status/sylvanding/omelette/ci.yml?branch=main&style=flat-square&logo=githubactions&logoColor=white&label=CI" alt="CI"></a>
  <a href="https://github.com/sylvanding/omelette/blob/main/LICENSE"><img src="https://img.shields.io/github/license/sylvanding/omelette?style=flat-square&color=blue" alt="License"></a>
  <a href="https://www.python.org/"><img src="https://img.shields.io/badge/python-3.12-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python 3.12"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-22+-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js 22+"></a>
  <a href="https://fastapi.tiangolo.com/"><img src="https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI"></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React_18-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 18"></a>
  <a href="https://sylvanding.github.io/omelette/zh/"><img src="https://img.shields.io/badge/文档-VitePress-646CFF?style=flat-square&logo=vitepress&logoColor=white" alt="Docs"></a>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="https://sylvanding.github.io/omelette/zh/">在线文档</a> ·
  <a href="#-快速开始">快速开始</a> ·
  <a href="https://github.com/sylvanding/omelette/issues">报告问题</a>
</p>

---

Omelette 自动化完整的科研文献流程 — 从关键词管理、多源检索、去重过滤、PDF 爬取，到 OCR 文本提取、RAG 知识库构建和 AI 写作辅助。

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

  </td>
  <td width="50%">

  **📥 PDF 爬取**
  Unpaywall、arXiv、直链多通道下载，智能回退策略。

  **📝 OCR 解析**
  pdfplumber 原生文本提取，PaddleOCR GPU 加速处理扫描件。

  **🧠 RAG 知识库**
  ChromaDB 向量索引，混合检索，LLM 生成带引用的回答。

  **✍️ 写作辅助**
  论文摘要、引用生成（GB/T 7714、APA、MLA）、综述提纲、缺口分析。

  </td>
</tr>
</table>

## 🏗️ 架构概览

```
关键词 ─→ 检索 ─→ 去重 ─→ 爬虫 ─→ OCR ─→ RAG ─→ 写作
  │        │       │       │       │      │       │
  ▼        ▼       ▼       ▼       ▼      ▼       ▼
[LLM]   [数据源] [SQLite] [PDF] [Paddle] [Chroma] [LLM]
```

| 层级 | 技术 |
|------|------|
| **后端** | FastAPI、SQLAlchemy 2（异步）、Pydantic v2、Python 3.12 |
| **前端** | React 18、Vite、TypeScript、TailwindCSS v4 |
| **数据库** | SQLite + aiosqlite |
| **向量库** | ChromaDB |
| **OCR** | pdfplumber（原生）+ PaddleOCR（扫描件，可选） |
| **LLM** | OpenAI 兼容接口（阿里云百炼 / 火山引擎豆包） |
| **嵌入** | BAAI/bge-m3 via sentence-transformers（可选） |
| **文档** | VitePress（中英双语） |

## 🚀 快速开始

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

<details>
<summary><strong>主要环境变量</strong></summary>

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | SQLite 路径（默认：`sqlite:///./data/omelette.db`） |
| `DATA_DIR` | PDF、OCR 输出、ChromaDB 的根目录 |
| `LLM_PROVIDER` | `aliyun`、`volcengine` 或 `mock` |
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

访问 [http://localhost:3000](http://localhost:3000)。

### 5.（可选）OCR 与嵌入

```bash
cd backend
pip install -e ".[ocr,ml]"
```

> **常见问题：** 如果报 `ModuleNotFoundError: No module named 'fastapi'`，请确认已激活 conda 环境：`conda activate omelette`。

## 📂 项目结构

```
omelette/
├── backend/              # FastAPI 应用
│   ├── app/
│   │   ├── api/v1/       # REST 接口
│   │   ├── models/       # SQLAlchemy ORM 模型
│   │   ├── schemas/      # Pydantic 请求/响应模式
│   │   ├── services/     # 业务逻辑
│   │   ├── config.py     # 从 .env 加载配置
│   │   ├── database.py   # 异步引擎和会话
│   │   └── main.py       # 应用入口、生命周期、CORS
│   ├── tests/            # pytest-asyncio 测试（120+）
│   └── pyproject.toml    # Python 依赖
├── frontend/             # React 单页应用
│   └── src/
│       ├── pages/        # Dashboard、ProjectDetail、各模块页面
│       ├── components/   # Layout、共享 UI
│       ├── services/     # 类型化 API 客户端
│       ├── stores/       # Zustand 状态
│       └── lib/          # Axios 客户端、工具函数
├── docs/                 # VitePress 文档站（中英双语）
├── assets/               # Banner、Logo、吉祥物图片
├── environment.yml       # Conda 环境（Python 3.12）
├── Makefile              # 开发工作流快捷命令
├── .env.example          # 配置模板
└── .github/workflows/    # CI（ruff、pytest、tsc、build、文档部署）
```

## 🛠️ 开发

```bash
make pre-commit-install   # 安装 pre-commit 钩子
make lint                 # 运行代码检查
make format               # 自动格式化代码
make test                 # 运行所有测试
make dev                  # 同时启动前后端
```

### 运行测试

```bash
# 后端（120+ 测试）
cd backend && pytest tests/ -v

# 前端类型检查和构建
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
| `GET /settings/health` | 健康检查 |

完整文档：[API 参考](https://sylvanding.github.io/omelette/zh/api/)

## 🤝 参与贡献

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 📄 许可证

[MIT License](LICENSE) — Copyright © 2026 [Sylvan Ding](https://github.com/sylvanding)
