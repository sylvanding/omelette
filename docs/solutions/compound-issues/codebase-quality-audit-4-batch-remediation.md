---
title: "Codebase Quality Audit and 4-Batch Technical Debt Remediation"
date: 2026-03-12
category: compound
severity: critical
component:
  - backend
  - frontend
  - api
  - security
  - mcp
  - testing
tags:
  - code-quality
  - security-audit
  - technical-debt
  - error-handling
  - performance
  - testing
  - n-plus-one
  - code-splitting
  - toast
  - vitest
symptoms:
  - Path traversal vulnerability in dedup conflict resolution
  - N+1 queries degrading list endpoint performance
  - Silent failures from broad exception swallowing
  - No frontend error feedback (no toast, no onError)
  - Native confirm() dialogs instead of accessible UI components
  - 1.4MB single JS bundle without code splitting
  - Zero frontend test coverage
  - Duplicated _ensure_project across 10 API modules
  - MCP resource endpoints crashing on invalid IDs
root_cause: |
  Accumulated technical debt from iterative feature development without
  systematic security review, error-handling standards, or test coverage
  requirements. No shared patterns for auth, validation, or error feedback.
---

# Codebase Quality Audit and 4-Batch Remediation

## Problem

After rapid feature development (V2 with LlamaIndex RAG, LangGraph pipelines, MCP server, chat playground), the Omelette codebase accumulated significant technical debt across security, error handling, code quality, and testing.

**Key symptoms:**
- Path traversal vulnerability allowed accessing arbitrary files via crafted `conflict_id`
- No API authentication mechanism for production deployments
- N+1 queries in project/conversation list endpoints (1 query per item for counts)
- Frontend mutations silently failed with no user feedback
- `confirm()` dialogs not accessible and cannot be themed
- Single 1.4MB JS bundle loaded on every page
- Zero frontend tests
- `_ensure_project` helper copy-pasted across 10 API modules

## Root Cause Analysis

The root cause was **missing architectural patterns** established during initial development:

1. **Security**: No input validation layer, no auth middleware, no path sanitization
2. **Error handling**: Services swallowed exceptions with `except Exception`, frontend had no error feedback loop
3. **Code quality**: No shared dependency injection patterns, no performance budgets
4. **Testing**: Backend had good coverage (178 tests), but frontend had zero tests and no infrastructure

## Solution

### Batch 1: Security and Stability (11 items)

| Fix | File | Impact |
|-----|------|--------|
| Path traversal validation | `dedup.py` | Prevents arbitrary file access |
| Default secret key warning | `main.py` | Alerts on production misconfiguration |
| Project existence checks | `writing.py` | Prevents operations on deleted projects |
| MCP ID validation | `mcp_server.py` | Returns 400 instead of 500 |
| Cross-project paper check | `projects.py` | Prevents data leakage |
| API Key middleware | `middleware/auth.py` | Optional API protection |
| React Error Boundary | `ErrorBoundary.tsx` | Prevents white-screen crashes |
| SSE body null check | `services/api.ts` | Graceful streaming failures |
| Axios error normalization | `lib/api.ts` | Consistent Error objects |

**Key pattern — API Key Middleware:**

```python
# backend/app/middleware/auth.py
EXEMPT_PATHS = frozenset({"/", "/health", "/docs", "/openapi.json", "/redoc"})
EXEMPT_PREFIXES = ("/mcp",)

class ApiKeyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if not settings.api_secret_key:
            return await call_next(request)
        if request.method == "OPTIONS":
            return await call_next(request)
        path = request.url.path
        if path in EXEMPT_PATHS or any(path.startswith(p) for p in EXEMPT_PREFIXES):
            return await call_next(request)
        api_key = request.headers.get("X-API-Key") or request.query_params.get("api_key")
        if api_key != settings.api_secret_key:
            return JSONResponse(status_code=401, content={...})
        return await call_next(request)
```

### Batch 2: Error Handling and UX (10 items)

| Fix | Impact |
|-----|--------|
| Sonner toast system | User sees success/error feedback |
| ConfirmDialog (AlertDialog) | Accessible, themed delete confirmations |
| N+1 fix: projects | Single query with correlated subqueries |
| N+1 fix: conversations | Same pattern for message_count |
| API service typing | TypeScript catches response shape errors |
| Mutation onError handlers | Toast error on every failed mutation |

**Key pattern — N+1 elimination:**

```python
paper_count_sq = (
    select(func.count(Paper.id))
    .where(Paper.project_id == Project.id)
    .correlate(Project)
    .scalar_subquery()
    .label("paper_count")
)
stmt = select(Project, paper_count_sq, kw_count_sq)
    .order_by(Project.updated_at.desc())
    .offset(...).limit(...)
```

### Batch 3: Code Quality (9 items)

| Fix | Impact |
|-----|--------|
| Shared `get_project` in deps.py | Eliminated 10 duplicate helpers |
| Route-level code splitting | **1396KB → 450KB** main bundle |
| MessageBubble `memo()` | Fewer re-renders during streaming |
| List key fixes | Correct React reconciliation |
| f-string log fixes | Lazy-evaluated logging |
| Root endpoint ApiResponse | Consistent API contract |

**Key pattern — Shared dependency:**

```python
# backend/app/api/deps.py
async def get_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
) -> Project:
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

# Usage in any endpoint:
async def some_endpoint(project: Project = Depends(get_project), ...):
```

### Batch 4: Testing and Polish (6 items)

| Fix | Impact |
|-----|--------|
| Vitest + testing-library + MSW | Frontend test infrastructure |
| 9 core tests (3 files) | ChatInput, API client, KnowledgeBasesPage |
| KB picker → Popover | Escape to close, proper focus management |
| Exception narrowing | Specific catch types in crawler/ocr/pdf |
| formatDate locale | Dynamic locale based on i18n |
| CI frontend test step | Tests run on every push |

**Key pattern — Test utilities:**

```tsx
// frontend/src/test/utils.tsx
export function renderWithProviders(ui: React.ReactElement, options?) {
  const queryClient = createTestQueryClient();
  return render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <BrowserRouter>{children}</BrowserRouter>
        </I18nextProvider>
      </QueryClientProvider>
    ),
    ...options,
  });
}
```

## Verification

| Check | Result |
|-------|--------|
| Backend tests | 178 passed |
| Frontend tests | 9 passed (3 files) |
| TypeScript | 0 errors |
| Ruff lint | All checks passed |
| Frontend build | Success (450KB main chunk) |
| Pre-commit hooks | All passed |

## Prevention Strategies

### Pre-merge Checklist

- [ ] No user-controlled paths without `Path().name` validation
- [ ] Project-scoped endpoints use `get_project` from `deps.py`
- [ ] Paper/resource IDs validated before cross-project access
- [ ] Mutations have `onError` with `toast.error()`
- [ ] No `confirm()`; use `ConfirmDialog` for destructive actions
- [ ] Logging uses `%s` style, not f-strings
- [ ] Lists use stable IDs as keys
- [ ] New routes return `ApiResponse`
- [ ] New endpoints have tests

### Automated Guards

- **Ruff**: Enable `G` (logging format), `S` (security), `TRY` (exception patterns)
- **ESLint**: Add `react/jsx-key`, `@typescript-eslint/no-explicit-any`
- **Pre-commit**: Add `detect-secrets` or `gitleaks`
- **CI**: Add bundle size check, remove mypy `continue-on-error`

### Architecture Patterns Established

1. **`get_project`** — Single shared dependency for project validation
2. **`ApiKeyMiddleware`** — Optional auth, exempt paths for docs/health/MCP
3. **`ErrorBoundary`** — Global React error catch with reload fallback
4. **`ConfirmDialog`** — AlertDialog wrapper for all destructive actions
5. **Sonner `toast`** — User feedback on all mutations via `onSuccess`/`onError`
6. **`React.lazy`** — Route-level code splitting with Suspense fallback
7. **`renderWithProviders`** — Test utility wrapping QueryClient + i18n + Router
8. **MSW** — API mocking for frontend tests

## Related Documents

- **Origin**: [docs/brainstorms/2026-03-12-codebase-quality-audit-brainstorm.md](../../brainstorms/2026-03-12-codebase-quality-audit-brainstorm.md)
- **Batch 1 plan**: [docs/plans/2026-03-12-fix-batch1-security-stability-plan.md](../../plans/2026-03-12-fix-batch1-security-stability-plan.md)
- **Batch 2 plan**: [docs/plans/2026-03-12-fix-batch2-error-handling-ux-plan.md](../../plans/2026-03-12-fix-batch2-error-handling-ux-plan.md)
- **Batch 3 plan**: [docs/plans/2026-03-12-refactor-batch3-code-quality-plan.md](../../plans/2026-03-12-refactor-batch3-code-quality-plan.md)
- **Batch 4 plan**: [docs/plans/2026-03-12-feat-batch4-testing-polish-plan.md](../../plans/2026-03-12-feat-batch4-testing-polish-plan.md)
- **Related**: [docs/solutions/performance-issues/blocking-sync-calls-asyncio-to-thread.md](../performance-issues/blocking-sync-calls-asyncio-to-thread.md) (async patterns)
- **Related**: [docs/solutions/test-failures/test-database-pollution-tempfile-mkdtemp.md](../test-failures/test-database-pollution-tempfile-mkdtemp.md) (test isolation)
- **Security audit**: [docs/security/SECURITY-AUDIT-2025-03-11.md](../../security/SECURITY-AUDIT-2025-03-11.md)

## Impact

| Metric | Before | After |
|--------|--------|-------|
| Security vulnerabilities | 5 critical | 0 |
| Frontend test coverage | 0% | 9 core tests |
| JS bundle size | 1396 KB | 450 KB (-68%) |
| `_ensure_project` copies | 10 | 1 (shared) |
| N+1 query endpoints | 2 | 0 |
| `confirm()` usage | 4 | 0 (all AlertDialog) |
| Mutation error handlers | 0 | All mutations covered |
| Files changed | — | 62 |
| Backend tests | 178 | 178 (stable) |
