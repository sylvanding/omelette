<p align="center">
  <img src="assets/banner.png" alt="Omelette Banner" width="680" />
</p>

<p align="center">
  <strong>AI 驱动的科学文献全生命周期管理系统</strong>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="https://sylvanding.github.io/omelette/">文档</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="https://github.com/sylvanding/omelette/issues">报告问题</a>
</p>

---

Omelette 是一个全栈科学文献管理系统，覆盖文献检索、去重、PDF 下载、OCR 处理、RAG 知识库构建和 AI 对话式交互的完整生命周期。

> **Om** (Omni-) + **Lit** (Literature) = **Omlit** ≈ **Omelette** 🍳

## 功能特性

### 文献流水线
- **关键词管理** — 三级层次结构，LLM 扩展和 WOS/Scopus/PubMed 检索式生成
- **多源检索** — Semantic Scholar、OpenAlex、arXiv、Crossref 联合检索
- **智能去重** — 三阶段：DOI 精确匹配 → 标题相似度 → LLM 验证
- **PDF 爬虫** — Unpaywall、arXiv、直链回退多渠道下载
- **OCR 处理** — MinerU + pdfplumber + PaddleOCR
- **增量订阅** — RSS 和 API 定时更新

### AI 与知识管理
- **RAG 知识库** — LlamaIndex + ChromaDB，GPU 加速嵌入，混合检索
- **Chat Playground** — 对话式文献问答
- **多模型 LLM** — OpenAI、Anthropic、阿里云百炼、火山引擎、Ollama
- **LangGraph 流水线** — 状态图编排 + 人机交互

### 研究工具
- **音频概述** — LLM 论文对话音频
- **引用工具** — APA、MLA、Chicago、IEEE、GB/T 7714
- **作者网络** — d3-force 合作网络可视化
- **趋势分析** — 年度主题趋势
- **缺口分析** — 研究空白识别
- **版本追踪** — Semantic Scholar 版本监控
- **论文对比** — 并排比较

### 协作与体验
- **团队管理** — RBAC 权限
- **国际化** — 完整中英文双语
- **PWA** — 可安装、离线缓存
- **暗色模式** — 跟随系统

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18, TypeScript, Vite, TailwindCSS v4, shadcn/ui |
| 后端 | FastAPI, SQLAlchemy 2 (async), Pydantic v2, Python 3.12 |
| 数据库 | SQLite + aiosqlite, Alembic |
| 向量库 | ChromaDB + BAAI/bge-m3 |
| LLM | LangChain (OpenAI, Anthropic, 阿里云, 火山引擎, Ollama) |
| OCR | MinerU + pdfplumber + PaddleOCR |
| 文档 | VitePress (中/英双语) |

## 快速开始

```bash
git clone git@github.com:sylvanding/omelette.git && cd omelette

# 后端
conda env create -f environment.yml && conda activate omelette
cp .env.example .env
cd backend && alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 前端（新终端）
cd frontend && npm install && npm run dev -- --port 3000
```

打开 [http://localhost:3000](http://localhost:3000)。

## 测试

```bash
cd frontend && npm test     # 273 测试 (Vitest)
cd backend && pytest tests/ # 861 测试 (pytest-asyncio)
npx playwright test          # 39 E2E 测试
```

## 许可证

[MIT License](LICENSE) — Copyright © 2026 [Sylvan Ding](https://github.com/sylvanding)
