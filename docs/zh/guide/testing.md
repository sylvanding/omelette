# 测试指南

## 后端测试

```bash
cd backend
pytest tests/ -v --tb=short
# 857 测试 · pytest-asyncio · 42 跳过（需要 GPU/LLM）
```

### 代码检查

```bash
ruff check app/          # Python 代码检查
ruff format --check app/ # 格式检查
mypy app/                # 类型检查
```

## 前端测试

```bash
cd frontend
npm test           # 264 测试 · Vitest + Testing Library + MSW
npx tsc --noEmit   # TypeScript 严格模式
npx eslint src/    # 代码检查
```

## E2E 测试

```bash
npx playwright test     # 39 测试
npx playwright test --ui  # 交互模式
```

## 测试统计

| 套件 | 框架 | 测试数 |
|------|------|--------|
| 后端 | pytest-asyncio | 857 |
| 前端 | Vitest + MSW | 264 |
| E2E | Playwright | 39 |
| **合计** | | **1,160** |

## CI 流程

GitHub Actions 在每次推送和 PR 时运行：
1. 后端：ruff → ruff-format → mypy → pytest
2. 前端：ESLint → tsc → vitest
3. 文档：VitePress 构建
4. E2E：Playwright（PR 时）

所有检查必须在合并前通过。
