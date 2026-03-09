# 快速开始

本指南介绍如何从零搭建 Omelette。

## 前置要求

- [Conda](https://docs.conda.io/) 或 Miniconda
- Node.js 22+
- （可选）CUDA，用于 OCR 与嵌入加速
- （可选）API Key：阿里云百炼/火山引擎（LLM）；Semantic Scholar（提高限速）

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

## 5. 启动前端

新开终端：

```bash
cd frontend
npm install
npm run dev
```

## 6. 访问应用

打开 [http://localhost:3000](http://localhost:3000)。

## 可选：OCR 与嵌入

完整 OCR 与嵌入支持：

```bash
conda activate omelette
cd backend
pip install -e ".[ocr,ml]"
```

- **OCR：** PaddleOCR（建议 GPU 版 `paddlepaddle-gpu`）
- **嵌入：** sentence-transformers + BAAI/bge-m3（首次使用自动下载）
