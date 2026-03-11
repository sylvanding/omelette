---
title: "Batch 4: 测试体系与打磨"
type: feat
status: active
date: 2026-03-12
origin: docs/brainstorms/2026-03-12-codebase-quality-audit-brainstorm.md
---

# Batch 4：测试体系与打磨

## Overview

建立前端测试基础设施（Vitest + @testing-library/react + MSW），覆盖核心流程测试，并完成剩余的低优先级修复（无障碍、主题 token、barrel exports 等）。此批次的目标是建立可持续的质量保障机制。

## Problem Statement

1. **前端零测试覆盖**：任何重构都无法验证正确性，UI 回归只能靠人工
2. **后端 mypy 不严格**：类型错误不阻断 CI
3. **小但累积的 UX 问题**：缺 aria-label、焦点管理不当、颜色不统一

## Proposed Solution

### Phase 1：前端测试基础设施

#### 1. 安装测试依赖

```bash
cd frontend
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom msw
```

#### 2. Vitest 配置 — `frontend/vitest.config.ts`

```typescript
// frontend/vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/test/**', 'src/**/*.d.ts'],
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
```

#### 3. 测试工具 — `frontend/src/test/setup.ts`

```typescript
// frontend/src/test/setup.ts
import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => cleanup())
```

#### 4. 测试辅助 — `frontend/src/test/utils.tsx`

```tsx
// frontend/src/test/utils.tsx
import { render, type RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import i18n from '@/i18n'

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

export function renderWithProviders(ui: React.ReactElement, options?: RenderOptions) {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <BrowserRouter>{ui}</BrowserRouter>
      </I18nextProvider>
    </QueryClientProvider>,
    options,
  )
}

export { render, screen, waitFor, within } from '@testing-library/react'
export { default as userEvent } from '@testing-library/user-event'
```

#### 5. MSW Mock 服务器 — `frontend/src/test/mocks/`

```typescript
// frontend/src/test/mocks/handlers.ts
import { http, HttpResponse } from 'msw'

export const handlers = [
  http.get('/api/v1/projects', () =>
    HttpResponse.json({
      code: 200,
      message: 'ok',
      data: { items: [{ id: 1, name: 'Test KB', description: '' }], total: 1 },
      timestamp: new Date().toISOString(),
    }),
  ),
  // ... 其他 mock
]

// frontend/src/test/mocks/server.ts
import { setupServer } from 'msw/node'
import { handlers } from './handlers'

export const server = setupServer(...handlers)
```

#### 6. CI 集成 — `.github/workflows/ci.yml`

在 `frontend-lint-build` job 中添加：

```yaml
- name: Run frontend tests
  run: npx vitest run --coverage
  working-directory: frontend
```

### Phase 2：核心流程测试

#### 7. streamChat 测试 — `frontend/src/services/__tests__/chat-api.test.ts`

测试 SSE 解析逻辑（如果仍保留自定义 fetch）或 useChat hook 集成。

```typescript
describe('streamChat', () => {
  it('should parse text_delta events', async () => { ... })
  it('should parse citation events', async () => { ... })
  it('should handle error events', async () => { ... })
  it('should handle network errors', async () => { ... })
})
```

#### 8. ChatInput 测试 — `frontend/src/components/playground/__tests__/ChatInput.test.tsx`

```typescript
describe('ChatInput', () => {
  it('should submit on Enter', async () => { ... })
  it('should not submit when empty', async () => { ... })
  it('should be disabled when isLoading', async () => { ... })
  it('should support Shift+Enter for newline', async () => { ... })
})
```

#### 9. MessageBubble 测试 — `frontend/src/components/playground/__tests__/MessageBubble.test.tsx`

```typescript
describe('MessageBubble', () => {
  it('should render user message', () => { ... })
  it('should render assistant message with markdown', () => { ... })
  it('should render citations', () => { ... })
  it('should render math formulas', () => { ... })
})
```

#### 10. API 客户端测试 — `frontend/src/services/__tests__/api.test.ts`

```typescript
describe('projectApi', () => {
  it('should fetch project list', async () => { ... })
  it('should handle 404 errors', async () => { ... })
  it('should handle network errors', async () => { ... })
})
```

#### 11. PlaygroundPage 测试 — `frontend/src/pages/__tests__/PlaygroundPage.test.tsx`

```typescript
describe('PlaygroundPage', () => {
  it('should render welcome state', () => { ... })
  it('should show KB picker', async () => { ... })
  it('should send message and display response', async () => { ... })
})
```

#### 12. SubscriptionManager 测试 — 测试 CRUD 和表单验证

#### 13. DedupConflictPanel 测试 — 测试冲突解决流程

### Phase 3：后端改进

#### 14. 收窄异常捕获类型

**影响文件**：

| 文件 | 当前 | 修改为 |
|------|------|--------|
| `crawler_service.py:38` | `except Exception` | `except (httpx.HTTPError, httpx.TimeoutException)` |
| `pipelines/nodes.py:224` | `except Exception` | `except (httpx.HTTPError, IOError)` |
| `pipelines/nodes.py:284` | `except Exception` | `except (subprocess.SubprocessError, FileNotFoundError, pdfplumber.PDFSyntaxError)` |
| `pipelines/nodes.py:339` | `except Exception` | `except (ValueError, RuntimeError)` |
| `ocr_service.py:41` | `except Exception` | `except (pdfplumber.PDFSyntaxError, FileNotFoundError)` |
| `ocr_service.py:113` | `except Exception` | `except (RuntimeError, ImportError)` |
| `pdf_metadata.py:54` | `except Exception` | `except (pdfplumber.PDFSyntaxError, KeyError, ValueError)` |
| `settings_api.py:55` | `except Exception` | `except (httpx.HTTPError, ValueError, KeyError)` |
| `dedup.py:235` | `except Exception` | `except (httpx.HTTPError, ValueError)` |

每处修改后使用 `logger.exception` 记录完整 traceback。

#### 15. 补全类型注解 — `backend/app/services/keyword_service.py`

```python
# 修改前
def _build_wos_formula(self, core: list, sub: list, expanded: list) -> str:
# 修改后
def _build_wos_formula(self, core: list[str], sub: list[str], expanded: list[str]) -> str:
```

全局搜索 `-> list:` 或 `(.*: list,` 修复类似问题。

#### 16. Unpaywall 邮箱配置化 — `backend/app/config.py`

```python
# config.py
unpaywall_email: str = ""

# crawler_service.py:74
if not settings.unpaywall_email:
    raise ValueError("UNPAYWALL_EMAIL must be configured for PDF downloads")
email = settings.unpaywall_email
```

#### 17. Mypy 渐进式开启

- 修复所有 batch 中涉及文件的 mypy 错误
- CI 中移除 `continue-on-error: true`
- 如有遗留错误，使用 `# type: ignore[specific-error]` 标注

### Phase 4：前端打磨

#### 18. 图标按钮 aria-label

**影响文件**：`PapersPage.tsx`, `ChatHistoryPage.tsx`, `KnowledgeBasesPage.tsx`

```tsx
// 示例
<Button variant="ghost" size="icon" aria-label={t('common.delete')}>
  <Trash2 className="h-4 w-4" />
</Button>
```

#### 19. KB picker 改为 Popover

```tsx
// frontend/src/pages/PlaygroundPage.tsx
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline">{t('chat.selectKB')}</Button>
  </PopoverTrigger>
  <PopoverContent>
    {/* KB 列表 */}
  </PopoverContent>
</Popover>
```

#### 20. ChatInput focus 优化

```tsx
// frontend/src/components/playground/ChatInput.tsx
const prevLoadingRef = useRef(isLoading)

useEffect(() => {
  if (prevLoadingRef.current && !isLoading) {
    textareaRef.current?.focus()
  }
  prevLoadingRef.current = isLoading
}, [isLoading])
```

#### 21. 变量遮蔽修复 — `KeywordsPage.tsx`

```typescript
// 修改前
terms.forEach((t: ...) => {
// 修改后
terms.forEach((termItem: ...) => {
```

#### 22. 不必要类型强转 — `SubscriptionManager.tsx`

```typescript
// 修改前
(t as (key: string, opts?: Record<string, unknown>) => string)('subscriptions.totalFound', { count: sub.total_found })
// 修改后
t('subscriptions.totalFound', { count: sub.total_found })
```

#### 23. Barrel exports — `frontend/src/components/knowledge-base/index.ts`

```typescript
// frontend/src/components/knowledge-base/index.ts
export { DedupConflictPanel } from './DedupConflictPanel'
export { PdfUploadDialog } from './PdfUploadDialog'
export { SearchAddDialog } from './SearchAddDialog'
// ...
```

#### 24. formatDate locale — `ChatHistoryPage.tsx`

```typescript
// 修改前
return d.toLocaleDateString('zh-CN')
// 修改后
import { useTranslation } from 'react-i18next'
const { i18n } = useTranslation()
return d.toLocaleDateString(i18n.language === 'zh' ? 'zh-CN' : 'en-US')
```

#### 25. 状态颜色主题化

在 `frontend/src/index.css` 中添加语义颜色变量：

```css
@theme {
  --color-status-success: var(--color-green-500);
  --color-status-warning: var(--color-yellow-500);
  --color-status-error: var(--color-red-500);
  --color-status-info: var(--color-blue-500);
}
```

将硬编码颜色替换为：`bg-status-success/10 text-status-success`。

## Acceptance Criteria

### 测试
- [ ] `vitest run` 通过且无失败用例
- [ ] 核心流程测试覆盖率 > 60%
- [ ] CI 集成前端测试步骤
- [ ] MSW mock 覆盖主要 API 端点

### 后端
- [ ] `except Exception` 数量减少到仅 transaction 和 optional feature 场景
- [ ] `mypy backend/app/ --strict` 错误数 < 20（从 continue-on-error 到可接受范围）
- [ ] Unpaywall 邮箱不再有 fallback 默认值

### 前端
- [ ] 所有图标按钮有 aria-label
- [ ] KB picker 可用 Escape 关闭
- [ ] 焦点不被意外抢夺
- [ ] 无 TypeScript 编译警告
- [ ] 状态颜色使用主题 token
- [ ] `npm run build` 输出无 chunk 超过 500KB（代码分割生效）

## Technical Considerations

- MSW v2 使用 ES modules，需确保 Vitest 配置兼容
- 前端测试需要 mock i18n 和 react-query provider
- Mypy strict 模式可能产生大量错误，需评估是否分文件启用

## Dependencies & Risks

- **新增依赖（dev）**：`vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`, `msw`
- **风险**：测试编写耗时可能超预期 —— 优先核心流程，其他渐进补充
- **前置**：Batch 1 + 2 + 3 完成

## Sources

- **Origin brainstorm**: [docs/brainstorms/2026-03-12-codebase-quality-audit-brainstorm.md](../brainstorms/2026-03-12-codebase-quality-audit-brainstorm.md)
- Issues: B16-B20, F26-F36 from brainstorm
- Vitest docs: https://vitest.dev/
- Testing Library docs: https://testing-library.com/docs/react-testing-library/intro
- MSW docs: https://mswjs.io/docs
