# Omelette Backend

FastAPI backend for the Omelette Scientific Literature Lifecycle Management System.

## Quick Start

```bash
cd backend
pip install -e ".[dev]"
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## Testing

```bash
pytest tests/ -v --tb=short
```

## Linting

```bash
ruff check app/ tests/
ruff format --check app/ tests/
```
