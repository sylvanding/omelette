---
title: "feat: 全面联调测试与项目配置审计"
type: feat
status: active
date: 2026-03-15
origin: docs/brainstorms/2026-03-15-integration-testing-and-audit-brainstorm.md
---

# 全面联调测试与项目配置审计

## Enhancement Summary

**Deepened on:** 2026-03-15
**Sections enhanced:** 5 (A-E)
**Research agents used:** config-audit, vitepress-sidebar, learnings-researcher

### Key Improvements
1. **精确的 .env.example 差异表**：14 个 config.py 配置项未在 .env.example 中，含 EMBEDDING_API_KEY 和 ALIYUN_BASE_URL 不一致问题
2. **完整的 VitePress sidebar 修复代码**：EN + ZH 侧边栏完整 TypeScript 代码 + deployment 入口 + 引用路径修正
3. **12 篇相关 learnings 整合**：测试数据库污染隔离（tempfile.mkdtemp）、asyncio.to_thread 阻塞调用、LangGraph HITL snapshot.next API 变更等

### New Considerations Discovered
- `ALIYUN_BASE_URL` 在 config.py 和 .env.example 中默认值不一致（需统一）
- `docs/guide/deployment.md` 引用了不存在的 `docs/guides/mineru-setup.md`（正确路径为 `docs/deployment/mineru-setup.md`）
- Guide sidebar 缺少 `Deployment` 入口
- 测试隔离提示：使用 `tempfile.mkdtemp()` 避免测试 DB 污染（来自 docs/solutions）

## Overview

Phase 0-5 已全部实现，现在需要全面联调验证前后端交互、审计配置文件同步性、修复文档遗留问题，确保项目进入可交付状态。

## Problem Statement

1. 新增的 Phase 4/5 功能（补全、引用图谱、综述生成、PDF 阅读器、Rate Limiting 等）尚未经过前后端联调验证
2. VitePress 侧边栏只显示 7/16 个 API 文档入口
3. `.env.example` 可能缺少 `config.py` 中的常用配置项
4. 安装的新依赖（slowapi、rollup-plugin-visualizer）需确认已写入配置文件
5. Makefile 和 README 可能未同步最新功能

(see brainstorm: docs/brainstorms/2026-03-15-integration-testing-and-audit-brainstorm.md)

## Proposed Solution

分 5 个阶段执行：配置审计修复 → 文档修复 → 后端测试全量运行 → 前端浏览器联调 → 文档化测试结果。

## Implementation Phases

### Phase A: 配置文件审计与修复（预计 30min）

#### A-1: .env.example 补全

检查 `backend/app/config.py` 中所有配置项，将常用的补入 `.env.example`：

**需要添加的配置项：**

| 变量 | 默认值 | 分类 |
|------|--------|------|
| LLM_TEMPERATURE | 0.7 | LLM 高级设置 |
| LLM_MAX_TOKENS | 4096 | LLM 高级设置 |
| EMBEDDING_PROVIDER | mock | Embedding |
| OCR_LANG | ch | OCR |
| OPENAI_API_KEY | | LLM: OpenAI |
| OPENAI_BASE_URL | https://api.openai.com/v1 | LLM: OpenAI |
| OPENAI_MODEL | gpt-4o | LLM: OpenAI |
| ANTHROPIC_API_KEY | | LLM: Anthropic |
| ANTHROPIC_MODEL | claude-sonnet-4-20250514 | LLM: Anthropic |
| OLLAMA_BASE_URL | http://localhost:11434 | LLM: Ollama |
| OLLAMA_MODEL | qwen2.5 | LLM: Ollama |

**额外发现需添加**：
| EMBEDDING_API_KEY | | Embedding（API 模式需要） |
| OPENAI_BASE_URL | https://api.openai.com/v1 | LLM: OpenAI |

**不添加的（专家级）**：dedup 阈值、langgraph_checkpoint_dir

**注意**：ALIYUN_BASE_URL 在 config.py 默认值为 `https://dashscope.aliyuncs.com/compatible-mode/v1`，但 .env.example 中写的是 `https://coding.dashscope.aliyuncs.com/v1`。需在注释中说明差异。

#### Research Insights (Phase A)

- config.py 与 .env.example 共有 **14 个差异项**，其中 EMBEDDING_API_KEY 和 OPENAI_BASE_URL 在上方表格中遗漏，需补入
- Makefile 已包含 `dev`、`test`、`lint`、`format`、`docs` 等命令，无需更新
- README API 列表缺少 3 个 Phase 4 新端点（complete、citation-graph、review-draft/stream）

#### A-2: pyproject.toml 依赖验证

```bash
# 检查实际安装的包是否都在 pyproject.toml 中
pip list --format=freeze | grep -i "slowapi\|limits\|deprecated"
```

验证 `slowapi>=0.1.9` 已在 dependencies 中（Phase 5 已添加）。

#### A-3: package.json 依赖验证

```bash
# 检查 rollup-plugin-visualizer 是否在 devDependencies 中
grep "rollup-plugin-visualizer" frontend/package.json
```

#### A-4: Makefile 检查

检查 `Makefile` 是否存在以下命令：
- `make dev` — 启动前后端
- `make test` — 运行测试
- `make lint` — 运行 lint
- 是否需要更新

#### A-5: README.md 同步

检查 README 中的：
- API 端点列表是否包含 Phase 4 新端点（complete、citation-graph、review-draft/stream）
- Quick Start 步骤是否准确
- 功能列表是否涵盖 Phase 4 新功能

---

### Phase B: 文档修复（预计 30min）

#### B-1: VitePress 侧边栏补全

在 `docs/.vitepress/config.ts` 中为 EN 和 ZH 的 API sidebar 补充缺失的 9 个入口：

```
Chat, Conversations, Pipelines, Subscription, OCR, Dedup, Crawler, Settings, Tasks
```

#### B-2: API 文档内容质量检查

逐一检查 `docs/api/` 下 16 个文件：
- 端点路径是否与 `backend/app/api/v1/` 实际路由一致
- 请求/响应字段是否与 Pydantic schema 一致
- 示例 curl 命令是否可运行

#### B-3: 中文文档同步检查

确认 `docs/zh/api/` 下 16 个文件与英文版一一对应，内容不过期。

#### B-4: 部署文档中 MinerU 引用路径修正

`docs/guide/deployment.md` 引用了 `docs/guides/mineru-setup.md`（不存在），正确路径为 `docs/deployment/mineru-setup.md`。修改为 VitePress 链接格式：`[MinerU 部署指南](/deployment/mineru-setup)`。

#### B-5: Guide sidebar 补充 Deployment 入口

EN guide sidebar 在 Introduction 组中添加 `{ text: 'Deployment', link: '/guide/deployment' }`。

#### Research Insights (Phase B)

- sidebar 完整修复需在 EN/ZH 各添加 9 个 API 条目 + 1 个 guide 条目
- VitePress 死链警告：docs/solutions 中记录过因相对路径导致构建失败的案例（来自 `ci-crawler-tests-and-docs-deadlink.md`），使用绝对 VitePress 路径避免此问题

---

### Phase C: 后端 API 全量测试（预计 20min）

#### C-1: 运行全量 pytest

```bash
cd backend && /home/djx/miniconda3/envs/omelette/bin/python -m pytest tests/ -v --tb=short
```

目标：所有测试 PASS。记录测试结果。

#### C-2: 检查测试覆盖缺口

对照审计报告中的 70+ 端点，确认每个端点至少有一个测试。标记缺失的端点。

对于关键缺失（P0/P1 端点无测试），立即补写。

#### Research Insights (Phase C)

**来自 docs/solutions 的关键提示：**
- **测试 DB 隔离**：使用 `tempfile.mkdtemp()` 创建临时目录，避免测试残留 DB 文件（来自 `test-database-pollution-tempfile-mkdtemp.md`）
- **asyncio.to_thread**：LlamaIndex、PaddleOCR 同步调用需包装，测试中 mock 这些调用避免实际加载（来自 `blocking-sync-calls-asyncio-to-thread.md`）
- **LangGraph HITL**：v1.1.0+ 使用 `snapshot.next` 而非 `GraphInterrupt` 异常，pipeline 测试需注意（来自 `langgraph-hitl-interrupt-api-snapshot-next.md`）
- **httpx AsyncClient + ASGITransport** 是正确的异步测试方式，避免 event loop 冲突

#### C-3: 验证 Rate Limiting

```bash
# 快速验证 slowapi 是否生效
for i in $(seq 1 5); do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/api/v1/settings/health; done
```

---

### Phase D: 前端浏览器联调（预计 40min）

#### D-0: 启动前后端服务

```bash
# 后端
cd backend && APP_DEBUG=true LLM_PROVIDER=mock uvicorn app.main:app --host 0.0.0.0 --port 8000

# 前端
cd frontend && npm run dev
```

#### D-1: PlaygroundPage 联调

1. 打开 http://localhost:3000/
2. 发送消息 → 验证 SSE 流式返回
3. 在输入框输入 10+ 字符 → 验证补全建议弹出
4. 验证改写功能

#### D-2: 项目管理联调

1. 打开知识库页面 → 创建新项目
2. 进入项目 → 论文列表 → 手动添加论文
3. 验证论文详情、删除

#### D-3: 写作助手联调

1. 进入项目 → 写作助手
2. 选中论文 → 生成摘要
3. 生成引用（多种格式）
4. 切换到综述标签 → 触发流式生成 → 验证 SSE 输出

#### D-4: 发现页联调

1. 关键词 CRUD → AI 扩展
2. 搜索执行
3. 订阅创建

#### D-5: 设置页联调

1. 加载设置 → 切换 provider → 测试连接
2. 验证模型列表

#### D-6: 对话历史联调

1. 发送几条消息 → 查看历史列表
2. 点击打开历史对话 → 删除

---

### Phase E: 文档化与提交（预计 15min）

#### E-1: 创建测试报告

将联调结果写入 `docs/guide/testing.md`：
- 后端测试数量和通过率
- 前端联调结果摘要
- 已知问题和待修复项

#### E-2: 最终提交

```bash
git add -A
git commit -m "feat(docs,config): integration testing audit and documentation fixes"
```

## Acceptance Criteria

- [ ] `.env.example` 包含所有常用配置项（LLM providers、embedding、OCR）
- [ ] `pyproject.toml` 和 `package.json` 依赖与实际安装一致
- [ ] VitePress 侧边栏展示所有 16 个 API 文档入口
- [ ] 后端 pytest 全量通过（当前 51 个 + 补写缺失测试）
- [ ] 前端 9 个页面浏览器联调全部通过
- [ ] README API 列表包含 Phase 4 新端点
- [ ] 测试结果文档化到 `docs/guide/testing.md`

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-03-15-integration-testing-and-audit-brainstorm.md](../brainstorms/2026-03-15-integration-testing-and-audit-brainstorm.md)
  - Key decisions: 配置审计"常用暴露、专家级隐藏"策略；前端验证通过浏览器自动化；VitePress 侧边栏补全 16 个入口

### Internal References

- 后端 API 路由: `backend/app/api/v1/__init__.py`
- VitePress 配置: `docs/.vitepress/config.ts`
- 应用配置: `backend/app/config.py`
- 环境示例: `.env.example`
- Makefile: `Makefile`
- README: `README.md`

### Related Learnings (from docs/solutions/)

- `docs/solutions/integration-testing/2026-03-16-fastapi-langgraph-integration-testing-best-practices.md` — AsyncClient + ASGITransport 测试模式
- `docs/solutions/test-failures/test-database-pollution-tempfile-mkdtemp.md` — 测试 DB 隔离
- `docs/solutions/performance-issues/blocking-sync-calls-asyncio-to-thread.md` — 同步调用包装
- `docs/solutions/integration-issues/langgraph-hitl-interrupt-api-snapshot-next.md` — HITL snapshot.next API
- `docs/solutions/build-errors/ci-crawler-tests-and-docs-deadlink.md` — VitePress 死链防护
