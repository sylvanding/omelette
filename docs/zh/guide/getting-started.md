# 快速开始

本指南介绍如何从零搭建 Omelette。

## 前置要求

- [Conda](https://docs.conda.io/) 或 Miniconda
- Node.js 22+
- （可选）CUDA，用于 OCR 与嵌入加速
- （可选）API Key：OpenAI、Anthropic、阿里云百炼、火山引擎（LLM）；Semantic Scholar（提高限速）

## 1. 克隆仓库

```bash
git clone git@github.com:sylvanding/omelette.git
cd omelette
```

## 2. 配置 Conda 环境

```bash
conda env create -f environment.yml
conda activate omelette
```

## 3. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入 API Key 等
```

测试时可使用 `LLM_PROVIDER=mock`，无需真实 API Key。

## 4. 启动后端

```bash
cd backend
pip install -e ".[dev]"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**说明**：Alembic 迁移会在启动时自动执行，数据库 schema 会在服务接受请求前更新完毕。

## 5. 启动前端

新开终端：

```bash
cd frontend
npm install
npm run dev
```

## 6. 访问应用

打开 [http://localhost:3000](http://localhost:3000)。

## LLM 提供商选项

在 `.env` 中设置 `LLM_PROVIDER`，可选：

| 提供商 | 说明 |
|--------|------|
| `openai` | OpenAI API — 设置 `OPENAI_API_KEY`、`OPENAI_MODEL` |
| `anthropic` | Anthropic Claude — 设置 `ANTHROPIC_API_KEY`、`ANTHROPIC_MODEL` |
| `aliyun` | 阿里云百炼 — 设置 `ALIYUN_API_KEY`、`ALIYUN_BASE_URL`、`ALIYUN_MODEL` |
| `volcengine` | 火山引擎豆包 — 设置 `VOLCENGINE_API_KEY` 等 |
| `ollama` | 本地 Ollama — 设置 `OLLAMA_BASE_URL`、`OLLAMA_MODEL` |
| `mock` | 不调用真实 LLM，返回预设结果，用于测试 |

## MCP 使用

Omelette 提供 MCP 服务端，供 AI IDE（Claude Code、Codex、Cursor）连接：

1. **启动后端**，使 MCP 端点在 `http://localhost:8000/mcp` 可用。

2. **配置 AI IDE**，将 Omelette 添加为 MCP 服务端：
   - **Claude Code / Codex**：添加远程 MCP 服务端，URL 为 `http://localhost:8000/mcp`
   - **Cursor**：在 MCP 设置中添加 Omelette，使用相同 URL

3. 连接成功后，可直接在 AI 助手中使用 `search_knowledge_base`、`lookup_paper`、`add_paper_by_doi` 等工具。

## 可选：OCR 与嵌入

完整 OCR 与嵌入支持：

```bash
conda activate omelette
cd backend
pip install -e ".[ocr,ml]"
```

- **OCR：** PaddleOCR（建议 GPU 版 `paddlepaddle-gpu`）
- **嵌入：** sentence-transformers + BAAI/bge-m3（首次使用自动下载）

## 运行测试

```bash
cd backend
pytest tests/ -v
```

测试套件共 178 个用例，覆盖 API、服务与流水线。
