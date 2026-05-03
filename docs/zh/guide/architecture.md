# 架构

## 系统概览

Omelette 采用模块化管道架构，React 前端 + FastAPI 后端。

```
┌──────────────────────────────────────────────┐
│              前端 (React 18)                  │
│   TypeScript · Vite · TailwindCSS · shadcn/ui │
│         TanStack Query · Zustand              │
├──────────────────────────────────────────────┤
│              后端 (FastAPI)                   │
│  Python 3.12 · SQLAlchemy 2 · Pydantic v2    │
├─────────┬────────┬────────┬────────┬─────────┤
│  检索   │  去重   │  爬虫   │  OCR   │  RAG   │
│LangChain│Semantic│Unpaywal│ MinerU │LlamaIndx│
│ OpenAlex│Scholar │ arXiv  │Paddle  │ChromaDB │
├─────────┴────────┴────────┴────────┴─────────┤
│            存储: SQLite + ChromaDB              │
└──────────────────────────────────────────────┘
```

## 管道流程

```
关键词 → 检索 → 去重 → 爬虫 → OCR → RAG → 写作
    │                                              │
    └────────── LangGraph 编排 ─────────────────────┘
```

## 后端模式

### API 结构
- 所有端点位于 `/api/v1/`
- 统一响应格式：`{ code, message, data }`
- 分页格式：`{ items, total, page, page_size, total_pages }`
- `project_id` 路径参数限定项目资源

### 数据库
- SQLAlchemy 2 异步 + aiosqlite
- Alembic 迁移管理 schema 变更
- `selectinload()` 预加载关联查询
- 项目删除时级联删除关联数据

### LLM 集成
- LangChain 提供商抽象层（OpenAI、Anthropic、阿里云、火山引擎、Ollama）
- Mock 模式用于无 API 密钥的本地开发
- GPU 模型 TTL 管理

## 关键设计决策

1. **SQLite** 适合单用户场景，无需额外配置。
2. **自定义遮罩层** 用于全屏模态框（作者网络、参考文献生成器）。
3. **LocalStorage** 存储阅读目标和引用样式偏好。
4. **端口 3000** 为 Vite 开发服务器，代理 `/api` 到后端端口 8000。
