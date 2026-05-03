# 快速开始

## 环境要求

- [Conda](https://docs.conda.io/) 或 Miniconda
- Node.js 22+
- (可选) CUDA GPU 用于加速 OCR/嵌入

## 快速安装

```bash
git clone git@github.com:sylvanding/omelette.git && cd omelette

# 后端
conda env create -f environment.yml && conda activate omelette
cp .env.example .env
cd backend && alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &

# 前端
cd ../frontend && npm install && npm run dev -- --port 3000
```

打开 [http://localhost:3000](http://localhost:3000)。

## 配置

主要环境变量（`.env` 文件中）：

| 变量 | 用途 | 默认值 |
|------|------|--------|
| `LLM_PROVIDER` | LLM 后端 | `mock`（无需 API 密钥） |
| `OPENAI_API_KEY` | OpenAI 密钥 | （空） |
| `ANTHROPIC_API_KEY` | Anthropic 密钥 | （空） |
| `DATABASE_URL` | 数据库路径 | `sqlite:///./data/omelette.db` |
| `DATA_DIR` | 文件存储 | `data` |

使用 `LLM_PROVIDER=mock` 时无需配置 API 密钥。

## 入门步骤

1. **创建项目** → 知识库 → 新建
2. **添加论文** → 搜索添加或上传 PDF
3. **探索** → 浏览、搜索、分析
4. **聊天** → 在 Playground 中对文献提问

## 项目结构

```
omelette/
├── backend/     # FastAPI (Python 3.12) · 861 测试
├── frontend/    # React SPA (TypeScript) · 273 测试
├── e2e/         # Playwright · 39 测试
├── docs/        # VitePress 文档
└── scripts/     # Ralph 代理工作流
```
