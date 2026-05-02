# Omelette Project Conventions

## PR Management (CRITICAL)

**Always check and maintain a PR at the end of each work session.**

- Before wrapping up, run `gh pr list` to verify there's an open PR tracking the current branch
- If no PR exists, create one with `gh pr create`
- Keep the PR description updated with the latest features, fixes, and test counts
- The PR must always reflect the current state of the branch

**Autonomous PR merging — no user approval needed.**

- When a PR is feature-complete and all quality checks pass (tests, lint, typecheck), merge it immediately
- Use `gh pr merge <number> --squash` with a concise subject line summarizing the release
- Do NOT ask the user for permission to merge — just do it
- After merging, switch to `main`, pull, and create a new feature branch for the next cycle

## Development Commands

```bash
# Frontend type check
cd frontend && npx tsc --noEmit

# Frontend tests
cd frontend && npm test

# Frontend lint
cd frontend && npx eslint src/

# Backend tests (must activate conda env)
conda run -n omelette python -m pytest backend/tests/ -q

# Backend lint
conda run -n omelette python -m ruff check backend/app/

# E2E tests (requires running frontend dev server)
npx playwright test

# Check format
cd frontend && npx eslint src/  # returns non-zero on issues
```

## Pre-commit Hooks

The repo has pre-commit hooks configured:
- trim trailing whitespace
- fix end of files
- check json
- check for merge conflicts
- check for added large files
- don't commit to branch (main)
- ruff / ruff-format (Python)
- ESLint frontend (TypeScript/JS)
- TypeScript check
- Conventional Commits

## Key Patterns

- API client uses axios interceptor that unwraps `response.data`
- All API responses use `ApiResponse<T>` wrapper: `{ code, message, data }`
- Frontend query keys defined in `frontend/src/lib/query-keys.ts`
- MSW handlers in `frontend/src/test/mocks/handlers.ts` for test fixtures
- i18n files at `frontend/src/i18n/locales/{en,zh}.json`
- Use `PageLayout` component for all project pages
