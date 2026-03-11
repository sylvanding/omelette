---
title: "Batch 1: 安全与稳定性修复"
type: fix
status: active
date: 2026-03-12
origin: docs/brainstorms/2026-03-12-codebase-quality-audit-brainstorm.md
---

# Batch 1：安全与稳定性修复

## Overview

修复所有 Critical 级别的安全漏洞和稳定性问题，包括路径遍历、默认密钥、跨项目访问、前端 Error Boundary、API 响应一致性等。同时引入简单的 API Key 认证中间件。

此为 4 批次改进计划的第一批，聚焦于最高优先级的安全和稳定性问题。

## Problem Statement

当前代码库存在多个安全漏洞和稳定性隐患：
- 后端：路径遍历可逃逸项目目录、默认密钥在生产环境不安全、API 端点缺少鉴权
- 前端：无 Error Boundary（组件异常导致白屏）、axios 拦截器导致 API 响应解包混乱

## Proposed Solution

### 后端修复（7 项）

#### 1. 路径遍历修复 — `backend/app/api/v1/dedup.py`

**问题**：`conflict_id` 包含用户输入的文件名，`../../` 可逃逸目录。

**修改位置**：`dedup.py:100-101`, `dedup.py:179-180`

```python
# backend/app/api/v1/dedup.py — resolve_conflict 和 batch_resolve

def _safe_filename(conflict_id: str) -> tuple[str, str]:
    """从 conflict_id 提取并验证安全的文件名"""
    parts = conflict_id.split(":", 1)
    if len(parts) != 2:
        raise HTTPException(status_code=400, detail="Invalid conflict_id format")
    project_id_str, filename = parts
    safe_name = Path(filename).name
    if safe_name != filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename in conflict_id")
    return project_id_str, safe_name
```

#### 2. 默认密钥保护 — `backend/app/config.py`

**问题**：`app_secret_key` 默认值为明文字符串。

**修改位置**：`config.py:24`

```python
# backend/app/config.py
app_secret_key: str = "change-me-to-a-random-secret-key"

# 在 main.py 启动时检查
if settings.app_env == "production" and settings.app_secret_key == "change-me-to-a-random-secret-key":
    logger.warning("SECURITY: Using default secret key in production! Set APP_SECRET_KEY environment variable.")
```

#### 3. Writing API 项目校验 — `backend/app/api/v1/writing.py`

**问题**：所有 writing 端点不检查 project 是否存在。

**修改位置**：`writing.py:59-154`（4 个端点均需添加）

```python
# 在每个 writing 端点开头添加
project = await db.get(Project, project_id)
if not project:
    raise HTTPException(status_code=404, detail="Project not found")
```

#### 4. MCP 资源 ID 校验 — `backend/app/mcp_server.py`

**问题**：`int(kb_id)` 对非数字输入抛 ValueError，导致 500。

**修改位置**：`mcp_server.py:393, 426, 458`

```python
# 每处 int() 转换包裹校验
try:
    kid = int(kb_id)
except (ValueError, TypeError):
    return f"Error: Invalid knowledge base ID '{kb_id}'. Must be a positive integer."
```

#### 5. Paper 跨项目访问校验 — `backend/app/api/v1/projects.py`

**问题**：`run_paper_pipeline` 不验证 paper 是否属于该项目。

**修改位置**：`projects.py:144-151`

```python
paper = await db.get(Paper, paper_id)
if not paper or paper.project_id != project_id:
    raise HTTPException(status_code=404, detail="Paper not found in this project")
```

#### 6. MCP 逻辑 bug — `backend/app/mcp_server.py`

**问题**：`if summary_type == "abstract" or summary_type != "llm"` 条件永远为真。

**修改位置**：`mcp_server.py:291-292`

```python
# 修复为正确的分支逻辑
if summary_type == "abstract":
    # 返回摘要
    ...
elif summary_type == "llm":
    # LLM 生成摘要
    ...
else:
    return f"Error: Unknown summary type '{summary_type}'"
```

#### 7. API Key 认证中间件 — 新建 `backend/app/middleware/auth.py`

```python
# backend/app/middleware/auth.py
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from app.config import settings

EXEMPT_PATHS = {"/", "/health", "/docs", "/openapi.json", "/redoc"}

class ApiKeyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not settings.api_secret_key:
            return await call_next(request)

        if request.url.path in EXEMPT_PATHS:
            return await call_next(request)

        api_key = request.headers.get("X-API-Key") or request.query_params.get("api_key")
        if api_key != settings.api_secret_key:
            raise HTTPException(status_code=401, detail="Invalid or missing API key")

        return await call_next(request)
```

**配置**：`config.py` 新增 `api_secret_key: str = ""`（空值时跳过认证）

**挂载**：`main.py` 中 `app.add_middleware(ApiKeyMiddleware)`

**.env.example** 新增：`API_SECRET_KEY=`

### 前端修复（4 项）

#### 8. Error Boundary — 新建 `frontend/src/components/ErrorBoundary.tsx`

```tsx
// frontend/src/components/ErrorBoundary.tsx
import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { hasError: boolean; error?: Error }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex flex-col items-center justify-center min-h-screen gap-4">
          <h1 className="text-xl font-semibold">出错了</h1>
          <p className="text-muted-foreground">{this.state.error?.message}</p>
          <button onClick={() => window.location.reload()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md">
            刷新页面
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
```

**在 `App.tsx` 中包裹**：

```tsx
<ErrorBoundary>
  <BrowserRouter>
    <Routes>...</Routes>
  </BrowserRouter>
</ErrorBoundary>
```

#### 9. 修复 axios 拦截器 — `frontend/src/lib/api.ts`

**问题**：拦截器返回 `response.data`（即 `ApiResponse`），调用方又用 `res?.data` 解包。

**方案**：拦截器保持返回 `response.data`（即 `ApiResponse` 对象），统一所有调用方直接访问 `.data` 字段。

```typescript
// frontend/src/lib/api.ts — 拦截器不变
api.interceptors.response.use(
  (response) => response.data, // 返回 ApiResponse { code, message, data, timestamp }
  (error) => {
    // 统一错误处理
    const message = error.response?.data?.message || error.message
    return Promise.reject(new Error(message))
  }
)

// 添加类型工具
export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
  timestamp: string
}
```

**影响**：需检查所有 `services/api.ts` 中的调用，确保一致使用 `res.data` 而非 `res?.data?.xxx`。

#### 10. response.body null 检查 — `frontend/src/services/api.ts`

**修改位置**：`services/api.ts:79`

```typescript
// 替换 response.body!.getReader()
if (!response.body) {
  throw new Error('Response body is null — streaming not supported')
}
const reader = response.body.getReader()
```

#### 11. 删除未使用的 Zustand store — `frontend/src/stores/projectStore.ts`

直接删除 `stores/projectStore.ts` 文件。确认全局搜索无引用后删除。

## Acceptance Criteria

- [ ] 路径遍历测试：`conflict_id` 包含 `../` 时返回 400
- [ ] 默认密钥：生产环境使用默认值时日志有 warning
- [ ] Writing API：不存在的 project_id 返回 404
- [ ] MCP：非数字 ID 返回友好错误而非 500
- [ ] Paper pipeline：paper 不属于项目时返回 404
- [ ] MCP summary：`summary_type="llm"` 能正确触发 LLM 分支
- [ ] API Key：设置 `API_SECRET_KEY` 后，无 key 请求返回 401；未设置时正常访问
- [ ] Error Boundary：子组件抛异常时显示 fallback UI 而非白屏
- [ ] API 响应：所有 API 调用方统一使用 `res.data` 解包
- [ ] SSE stream：`response.body` 为 null 时抛出明确错误
- [ ] Zustand store：`projectStore.ts` 已删除，`npm run build` 通过
- [ ] 所有现有后端测试通过
- [ ] 新增安全回归测试（路径遍历、跨项目访问）

## Technical Considerations

- API Key 中间件需豁免 MCP 端点（MCP 有自己的认证需求）或统一纳入
- axios 拦截器修改影响面大，需逐一检查所有 API 调用方
- Error Boundary 不能捕获事件处理器和异步代码中的错误，仅覆盖渲染错误

## Dependencies & Risks

- **风险**：axios 拦截器修改可能引发级联 bug —— 需要逐文件验证
- **风险**：API Key 中间件可能影响 CORS 预检请求 —— 需豁免 OPTIONS
- **依赖**：无新依赖引入

## Sources

- **Origin brainstorm**: [docs/brainstorms/2026-03-12-codebase-quality-audit-brainstorm.md](../brainstorms/2026-03-12-codebase-quality-audit-brainstorm.md)
- **Security audit**: [docs/security/SECURITY-AUDIT-2025-03-11.md](../security/SECURITY-AUDIT-2025-03-11.md)
- Issues: B1-B3, B7-B8, B18, F1-F4 from brainstorm
