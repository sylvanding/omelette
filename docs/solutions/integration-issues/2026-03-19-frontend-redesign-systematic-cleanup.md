---
title: "Frontend redesign systematic cleanup - sidebar duplication, API mismatches, dead code"
date: 2026-03-19
category: integration-issues
tags:
  - frontend
  - react
  - typescript
  - api-integration
  - deduplication
  - pipeline
  - dead-code
  - type-safety
severity: high
component: Frontend (React/TypeScript)
symptoms:
  - 3-column sidebar layout (DualSidebar + ChatHistorySidebar both visible)
  - Dedup conflict resolution failing (keep_existing vs keep_old mismatch)
  - Pipeline upload failing (file_paths vs pdf_paths mismatch)
  - Pipeline ResolvedConflict handling broken (type shape mismatch)
  - Hardcoded API URLs scattered across 7 locations
  - Missing frontend service methods for 5 backend endpoints
  - Type safety bypasses (as unknown as / as any casts)
root_cause:
  - Incomplete migration during redesign left legacy components active alongside new DualSidebar
  - Frontend-backend contract drift (naming and type shapes) not validated during redesign
  - No centralized API config; endpoints hardcoded in multiple places
  - Unused files and dependencies not removed during refactor
---

# Frontend Redesign Systematic Cleanup

After a comprehensive frontend redesign (Design System First approach with React 18 + TailwindCSS v4 + shadcn/ui), a systematic audit revealed 3 P0 bugs, dead code, API misalignment, and type safety issues.

## Problem Symptoms

1. Three-column sidebar: DualSidebar (icon rail + text panel) and ChatHistorySidebar rendered simultaneously
2. Dedup "Keep Existing" silently failed — backend returned 400 for unknown action `keep_existing`
3. Pipeline upload sent wrong field name, breaking PDF processing
4. 7 hardcoded `/api/v1/` paths scattered across the codebase
5. 5 backend endpoints with no frontend service methods

## Root Cause Analysis

The frontend redesign replaced many components (PageHeader → PageLayout, react-force-graph-2d → D3, custom sidebar → DualSidebar) but:
- **Legacy components weren't removed** — old files stayed in the tree
- **API contracts drifted** — backend used `keep_old`/`pdf_paths` while frontend used `keep_existing`/`file_paths`
- **No centralized API config** — each file hardcoded its own URL strings
- **Type safety was bypassed** — `as unknown as` casts hid mismatches at compile time

## Solution

### Fix 1: Sidebar Duplication

Integrated `ChatHistoryPanel` into `DualSidebar` as a context-aware sub-component. When on chat routes (`/` or `/chat/*`), the expanded panel shows conversation history; on other routes, it shows navigation items.

```typescript
// DualSidebar.tsx - route-aware panel switching
const isChatRoute = location.pathname === '/' || location.pathname.startsWith('/chat/');

// In the expandable panel:
{isChatRoute ? <ChatHistoryPanel /> : <NavPanel isActive={isActive} />}
```

Removed `ChatHistorySidebar` import and rendering from `PlaygroundPage.tsx`.

### Fix 2: Dedup Conflict Action Mismatch

Changed all occurrences of `keep_existing` to `keep_old` in `DedupConflictPanel.tsx`:

```typescript
// Before
const handleKeepAll = (action: 'keep_existing' | 'keep_new') => { ... }

// After — matches backend Literal["keep_old", "keep_new", "merge", "skip"]
const handleKeepAll = (action: 'keep_old' | 'keep_new') => { ... }
```

### Fix 3: Pipeline Type Mismatches

Updated `pipeline-api.ts` to match backend schemas:

```typescript
// Before
interface UploadPipelineRequest { file_paths?: string[]; }
interface ResolvedConflict { paper_id: number; action: 'keep' | 'replace' | 'skip'; }

// After — aligned with backend/app/api/v1/pipelines.py
interface UploadPipelineRequest { pdf_paths: string[]; }
interface ResolvedConflict {
  conflict_id: string;
  action: 'keep_old' | 'keep_new' | 'merge' | 'skip';
  merged_paper?: Record<string, unknown>;
  new_paper?: Record<string, unknown>;
}
```

### Fix 4: API URL Centralization

Created `frontend/src/lib/api-config.ts`:

```typescript
export const API_BASE = '/api/v1';
export function apiUrl(path: string): string { return `${API_BASE}${path}`; }
export function wsUrl(path: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${API_BASE}${path}`;
}
```

Replaced 7 hardcoded paths across `services/api.ts`, `lib/chat-transport.ts`, `services/rewrite-api.ts`, `hooks/use-pipeline-ws.ts`, `pages/project/PDFReaderPage.tsx`, `components/pdf-reader/SelectionQA.tsx`, `pages/project/WritingPage.tsx`.

### Fix 5: Dead Code & Dependency Cleanup

Deleted 4 unreferenced files: `sidebar-utils.ts`, `SidebarToggleButton.tsx`, `PageHeader.tsx`, `PageTransition.tsx`, plus `PageHeaderSkeleton` from `skeletons.tsx`.

Removed 3 unused npm dependencies (27 packages total): `@a2ui-sdk/react`, `@a2ui-sdk/types`, `react-force-graph-2d`.

### Fix 6: Missing API Service Methods

Added 5 frontend service methods to cover backend endpoints:
- `projectApi.runPipeline(projectId)` → `POST /projects/{id}/pipeline/run`
- `projectApi.runPaperPipeline(projectId, paperId)` → `POST /projects/{id}/pipeline/paper/{paperId}`
- `subscriptionApi.checkUpdates(projectId, ...)` → `POST /projects/{id}/subscriptions/check-updates`
- `dedupApi.verify(projectId, paperAId, paperBId)` → `POST /projects/{id}/dedup/verify`
- `writingApi.assist(projectId, request)` → `POST /projects/{id}/writing/assist`

### Fix 7: Type Safety Improvements

- Changed `DedupConflictPair.new_paper` from `NewPaperData` to `Record<string, unknown>` — eliminated 3 `as unknown as` casts
- Updated `paperApi.getCitationGraph` return type from `Record<string, unknown>` to `GraphData` — eliminated `as unknown as GraphData` in `PapersPage`
- Replaced `as unknown as SearchResult[]` in `AddPaperDialog` with proper field mapping

## Prevention Strategies

### 1. Frontend-Backend Type Drift

- **ESLint rule**: Forbid string literals containing `/api/v1` — force use of `apiUrl()`
- **Contract tests**: Add MSW-based tests that validate request/response shapes against backend schemas
- **Schema sync**: Consider OpenAPI codegen or `pydantic-to-typescript` for automated type generation

### 2. Dead Code Detection

- **CI check**: Add `knip` or `ts-prune` to CI to catch unused files and exports
- **Dependency check**: Run `depcheck` in CI to flag unused `package.json` entries
- **Refactor checklist**: When replacing components, always: delete old files, remove imports, remove deps, verify build

### 3. API URL Management

- **ESLint no-restricted-syntax**: Block `/api/v1` string literals in source
- **Central config**: All URLs through `apiUrl()` / `wsUrl()` from `api-config.ts`
- **Axios baseURL**: REST calls already use axios with `/api/v1` base; SSE/WS now use helpers

### 4. Layout Coordination

- **Single layout root**: `AppShell` → `DualSidebar` with context-aware panels
- **Route-based content**: Use route detection to decide panel content, not separate components
- **Layout diagram**: Document component hierarchy to prevent parallel sidebar additions

### 5. API Service Coverage

- **Endpoint registry**: Maintain `docs/api-registry.yaml` mapping backend endpoints to frontend methods
- **PR checklist**: Backend API PRs must include frontend service method update
- **Integration smoke test**: CI job that tests all service methods against backend

## Verification

All fixes verified with:
- `npx tsc --noEmit` — zero errors
- `npm run build` — successful production build (14s)
- 15 API endpoints tested via Vite proxy (all 200 OK)
- No lint errors

## Related Documentation

- **Origin brainstorm**: `docs/brainstorms/2026-03-19-frontend-systematic-cleanup-brainstorm.md`
- **Implementation plan**: `docs/plans/2026-03-19-refactor-frontend-systematic-cleanup-plan.md`
- **Frontend redesign plan**: `docs/plans/2026-03-19-feat-frontend-complete-redesign-plan.md`
- **Prior quality audit**: `docs/solutions/compound-issues/codebase-quality-audit-4-batch-remediation.md`
- **D3 citation graph**: `docs/solutions/2026-03-19-d3-citation-graph-react-integration.md`
