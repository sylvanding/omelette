# Getting Started

This guide walks you through setting up Omelette from scratch.

## Prerequisites

- [Conda](https://docs.conda.io/) or Miniconda
- Node.js 22+
- (Optional) CUDA for GPU-accelerated OCR and embeddings
- (Optional) API keys: Aliyun Bailian or Volcengine for LLM; Semantic Scholar for higher search limits

## 1. Clone the Repository

```bash
git clone git@github.com:sylvanding/omelette.git
cd omelette
```

## 2. Set Up Conda Environment

```bash
conda env create -f environment.yml
conda activate omelette
```

## 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your API keys (LLM, Semantic Scholar, etc.)
```

Use `LLM_PROVIDER=mock` for testing without API keys.

## 4. Start the Backend

```bash
cd backend
pip install -e ".[dev]"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## 5. Start the Frontend

In a new terminal:

```bash
cd frontend
npm install
npm run dev
```

## 6. Open the Application

Visit [http://localhost:3000](http://localhost:3000).

## Optional: OCR and Embeddings

For full OCR and embedding support:

```bash
conda activate omelette
cd backend
pip install -e ".[ocr,ml]"
```

- **OCR:** PaddleOCR (GPU recommended via `paddlepaddle-gpu`)
- **Embeddings:** sentence-transformers with BAAI/bge-m3 (downloads on first use)
