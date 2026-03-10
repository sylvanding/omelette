# Contributing to Omelette

Thank you for your interest in contributing. This guide covers development setup, code style, and the PR process.

## Development Setup

1. **Clone and create conda environment:**

   ```bash
   git clone git@github.com:sylvanding/omelette.git
   cd omelette
   conda env create -f environment.yml
   conda activate omelette
   ```

   This installs Python 3.12 and all backend dependencies (including dev tools) via `pip install -e "./backend[dev]"`.

2. **Frontend:**

   ```bash
   cd frontend
   npm install
   ```

3. **Environment config:**

   ```bash
   cp .env.example .env
   # Edit .env — use LLM_PROVIDER=mock for tests
   ```

4. **Pre-commit hooks:**

   ```bash
   make pre-commit-install
   ```

## Project Structure

```
omelette/
├── backend/           # FastAPI app
│   ├── app/
│   │   ├── api/v1/    # API routes
│   │   ├── models/    # SQLAlchemy models
│   │   ├── schemas/   # Pydantic schemas
│   │   ├── services/  # Business logic
│   │   ├── config.py
│   │   ├── database.py
│   │   └── main.py
│   ├── tests/
│   └── pyproject.toml # Python deps (single source of truth)
├── frontend/          # React + Vite
│   └── src/
├── docs/              # VitePress bilingual docs
├── environment.yml    # Conda env → pip install backend[dev]
└── .env.example       # Config template
```

## Code Style

### Python (Backend)

- **Linter/Formatter:** [Ruff](https://docs.astral.sh/ruff/) — `ruff check` and `ruff format`
- **Line length:** 120
- **Type hints:** Required for public APIs; mypy used in CI
- **Conventions:** Async SQLAlchemy, Pydantic v2, FastAPI dependency injection
- **Pre-commit:** Automatically runs ruff on staged files

### TypeScript (Frontend)

- **Strict mode:** `strict: true` in tsconfig
- **Build:** `npm run build` must pass with zero errors

## Git Conventions

- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) — `<type>(<scope>): <description>`
- **Types:** feat, fix, docs, style, refactor, test, chore, ci, perf, build, revert
- **Scopes:** backend, frontend, docs, ci, config, keywords, search, dedup, crawler, ocr, rag, writing
- **Pre-commit hook:** Enforces conventional commit format
- **Never commit:** `.env`, `*.db`, secrets

## Testing

**Backend:**

```bash
cd backend
pytest tests/ -v --tb=short
```

**Frontend:**

```bash
cd frontend
npx tsc --noEmit
npm run build
```

**Quick shortcuts:**

```bash
make test      # Run all tests
make lint      # Run all linters
make format    # Auto-format code
```

CI runs on push/PR to `main`: ruff lint+format, mypy, pytest (backend); tsc, build (frontend); docs build+deploy.

## Pull Request Process

1. Create a branch from `main` (e.g. `feat/keyword-expand`)
2. Make changes, run `make lint && make test` locally
3. Push and open a PR against `main`
4. Ensure CI passes
5. Request review; address feedback
6. Squash/merge after approval
