# Getting Started

## Prerequisites

- [Conda](https://docs.conda.io/) or Miniconda
- Node.js 22+
- (Optional) CUDA GPU for accelerated OCR/embeddings

## Quick Setup

```bash
git clone git@github.com:sylvanding/omelette.git && cd omelette

# Backend
conda env create -f environment.yml && conda activate omelette
cp .env.example .env
cd backend && alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &

# Frontend
cd ../frontend && npm install && npm run dev -- --port 3000
```

Open [http://localhost:3000](http://localhost:3000).

## Configuration

Key environment variables in `.env`:

| Variable | Purpose | Default |
|----------|---------|---------|
| `LLM_PROVIDER` | LLM backend | `mock` (no API key needed) |
| `OPENAI_API_KEY` | OpenAI key | (empty) |
| `ANTHROPIC_API_KEY` | Anthropic key | (empty) |
| `DATABASE_URL` | Database path | `sqlite:///./data/omelette.db` |
| `DATA_DIR` | File storage | `data` |
| `PDF_PARSER` | PDF engine | `auto` |

With `LLM_PROVIDER=mock`, no API keys are required for development.

## First Steps

1. **Create a project** → Knowledge Bases → New
2. **Add papers** → Search & Add or upload PDFs
3. **Explore** → Browse, search, analytics
4. **Chat** → Ask questions about your literature in Playground

## Project Structure

```
omelette/
├── backend/     # FastAPI (Python 3.12) · 861 tests
├── frontend/    # React SPA (TypeScript) · 273 tests
├── e2e/         # Playwright · 39 tests
├── docs/        # VitePress documentation
└── scripts/     # Ralph agent workflow
```
