# 系统架构

## 概览

Omelette 采用流水线架构，数据按顺序流经各模块：

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Omelette 流水线                               │
├─────────────────────────────────────────────────────────────────────────┤
│  Keywords → Search → Dedup → Crawler → OCR → RAG → Writing              │
└─────────────────────────────────────────────────────────────────────────┘
         │         │       │        │       │     │        │
         ▼         ▼       ▼        ▼       ▼     ▼        ▼
    [FastAPI]  [数据源] [SQLite] [PDF] [Paddle] [Chroma] [LLM]
```

每个模块消费前一阶段输出，为下一阶段提供输入。项目组织文献，关键词驱动检索，检索结果经去重、爬取、OCR、索引后供写作辅助查询。

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | FastAPI、SQLAlchemy 2（异步）、Pydantic v2 |
| 前端 | React 19、Vite 7、TypeScript、Tailwind CSS |
| 数据库 | SQLite |
| 向量库 | ChromaDB |
| OCR | PaddleOCR |
| LLM | OpenAI 兼容（阿里云百炼 / 火山引擎） |
| 嵌入 | BAAI/bge-m3（sentence-transformers） |

## 目录结构

```
omelette/
├── backend/              # FastAPI 应用
│   ├── app/
│   │   ├── api/v1/       # REST 接口
│   │   ├── models/       # SQLAlchemy 模型
│   │   ├── schemas/      # Pydantic 模式
│   │   ├── services/     # 业务逻辑
│   │   └── main.py
│   └── tests/
├── frontend/             # React SPA
├── docs/                 # VitePress 文档
├── environment.yml
├── .env.example
└── .github/workflows/
```
