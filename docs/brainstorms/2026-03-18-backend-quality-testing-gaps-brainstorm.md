---
title: "后端质量与测试缺口修补"
date: 2026-03-18
status: approved
tags: [backend, testing, code-quality, mcp, pipeline, chat]
---

# 后端质量与测试缺口修补

## 背景

在完成 21 项后端综合优化（安全、性能、一致性、新功能、架构）后，经深度审计发现仍存在以下缺口：
- 11 个 MCP 工具中 7 个无单元测试
- Pipeline 集成测试缺少真实 PDF 全流程和 HITL 中断→恢复
- 代码中存在硬编码常量、不一致的错误处理、路径注入风险
- Chat 的 4 种 tool_mode 仅测试了 qa 模式

## 改进内容

### 1. 代码质量全面改进

**硬编码值提取到 config.py：**
- `upload.py`: `MAX_FILE_SIZE_MB = 50`, `TITLE_SIMILARITY_THRESHOLD = 0.85`
- `citation_graph_service.py`: `S2_API_BASE`, `S2_TIMEOUT = 15`, `S2_MAX_PER_REQUEST = 100`
- `rewrite.py`: `REWRITE_TIMEOUT = 30.0`
- `main.py`: 版本号 `"0.1.0"`

**错误处理统一：**
- `citation_graph_service.py`: 返回 200 + `{"error": "..."}` → 改为 `HTTPException`
- `rewrite.py`: 过宽的 `Exception` 捕获 → 缩窄并区分可恢复/不可恢复异常

**输入验证与路径安全：**
- `UploadPipelineRequest.pdf_paths`: 添加路径遍历验证（禁止 `..`、绝对路径限制）
- `lookup_paper` ilike 查询安全性确认

**缺失测试补写：**
- `LLMConfigResolver` 单元测试
- `RerankerService` 单元测试（mock SentenceTransformer）

### 2. MCP 工具测试补全

为以下 7 个 MCP 工具添加单元测试：
- `search_knowledge_base` — RAG 搜索
- `find_citations` — 引文图谱
- `add_paper_by_doi` — DOI 导入
- `search_papers_by_keyword` — 关键词搜索
- `summarize_papers` — 论文摘要（WritingService）
- `generate_review_outline` — 综述大纲
- `analyze_gaps` — 研究缺口分析
- `manage_keywords` — 关键词管理（list/add/expand/delete）

### 3. Pipeline 真实 PDF 集成测试

**测试数据：** 使用 `/data0/djx/omelette_pdf_test/` 中的论文 PDF（最小的 ~700KB）

**覆盖流程：**
- Upload Pipeline API：PDF 上传 → 元数据提取 → 去重 → OCR → 索引
- HITL 中断→恢复：模拟去重冲突 → 中断 → 解决冲突 → 恢复
- Pipeline 列表与状态查询

### 4. Chat tool_mode 全模式测试

补充 3 种未测试的 tool_mode：
- `citation_lookup` — 引文检索模式
- `review_outline` — 综述大纲模式
- `gap_analysis` — 研究缺口分析模式

使用 mock LLM 验证各模式的 prompt 构造和输出格式。

## 关键决策

- **单用户系统**：不涉及多用户/权限改进
- **真实 PDF 测试**：使用已有的测试 PDF，标记为需要外部数据的 marker
- **不涉及真实 LLM 调用**：本轮改进重点在结构性测试，真实 LLM 测试由现有 E2E 覆盖
- **MCP 测试使用 mock**：避免依赖外部服务
