# Testing Guide

## Backend Tests

```bash
cd backend
pytest tests/ -v --tb=short
# 857 tests · pytest-asyncio · 42 skipped (GPU/LLM-dependent)
```

### Lint & Type Check

```bash
ruff check app/          # Python lint
ruff format --check app/ # Format check
mypy app/                # Type check
```

## Frontend Tests

```bash
cd frontend
npm test           # 264 tests · Vitest + Testing Library + MSW
npx tsc --noEmit   # TypeScript strict mode
npx eslint src/    # Lint
```

## E2E Tests

```bash
npx playwright test     # 39 tests
npx playwright test --ui  # Interactive mode
```

## Current Test Counts

| Suite | Framework | Tests |
|-------|-----------|-------|
| Backend | pytest-asyncio | 857 |
| Frontend | Vitest + MSW | 264 |
| E2E | Playwright | 39 |
| **Total** | | **1,160** |

## CI Pipeline

GitHub Actions runs on every push and PR:
1. Backend: ruff → ruff-format → mypy → pytest
2. Frontend: ESLint → tsc → vitest
3. Docs: VitePress build
4. E2E: Playwright (on PR)

All checks must pass before merge.

## Test Fixtures

- Backend: `conftest.py` with async test client, test database, mock LLM
- Frontend: MSW handlers in `src/test/mocks/handlers.ts` mock all API endpoints
- E2E: Real browser against dev server with test data
