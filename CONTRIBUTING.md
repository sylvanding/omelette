# Contributing to Omelette

Thank you for your interest in contributing. This guide covers development setup, project structure, code style, and the PR process.

## Development Setup

1. **Clone and create conda environment:**
   ```bash
   git clone git@github.com:sylvanding/omelette.git
   cd omelette
   conda env create -f environment.yml
   conda activate omelette
   ```

2. **Backend (with dev deps):**
   ```bash
   cd backend
   pip install -e ".[dev]"
   ```

3. **Frontend:**
   ```bash
   cd frontend
   npm install
   ```

4. **Environment:** Copy `.env.example` to `.env` and configure. Use `LLM_PROVIDER=mock` for tests.

## Project Structure

```
omelette/
├── backend/           # FastAPI app
│   ├── app/
│   │   ├── api/v1/    # API routes (keywords, search, dedup, crawler, ocr, rag, writing)
│   │   ├── models/    # SQLAlchemy models
│   │   ├── schemas/   # Pydantic schemas
│   │   ├── services/  # Business logic (LLM client, etc.)
│   │   ├── config.py
│   │   ├── database.py
│   │   └── main.py
│   └── tests/
├── frontend/          # React + Vite
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── stores/
│       ├── lib/
│       └── types/
├── environment.yml    # Conda env
└── .env.example       # Config template
```

## Code Style

### Python (Backend)

- **Linter:** [Ruff](https://docs.astral.sh/ruff/) — run `ruff check app/ tests/`
- **Formatter:** Ruff format (line-length 120)
- **Type hints:** Required for public APIs; mypy used in CI
- **Conventions:** Async SQLAlchemy, Pydantic v2, FastAPI dependency injection

### TypeScript (Frontend)

- **Strict mode:** `strict: true` in tsconfig
- **Linter:** ESLint
- **Build:** `npm run build` must pass

## Git Conventions

- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) — `<type>(<scope>): <description>`
- **Types:** feat, fix, docs, style, refactor, test, chore, ci, perf
- **Scopes:** backend, frontend, docs, ci, config, keywords, search, dedup, crawler, ocr, rag, writing
- **Branches:** `feat/<feature>`, `fix/<issue>`, `docs/<topic>`
- **Language:** Commit messages and code reviews in English
- **Never commit:** `.env` or secrets

## Testing

**Backend:**
```bash
cd backend
pytest tests/ -v --tb=short
```

**Frontend:** Type check and build:
```bash
cd frontend
npx tsc --noEmit
npm run build
```

CI runs on push/PR to `main`: ruff, mypy, pytest (backend); tsc, build (frontend).

## Pull Request Process

1. Create a branch from `main` (e.g. `feat/keyword-expand`)
2. Make changes, run lint/tests locally
3. Push and open a PR against `main`
4. Ensure CI passes
5. Request review; address feedback
6. Squash/merge after approval
