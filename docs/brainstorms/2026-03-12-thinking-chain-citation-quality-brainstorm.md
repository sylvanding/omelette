---
date: 2026-03-12
topic: thinking-chain-citation-quality
---

# 思维链 UX + 引用质量优化

## 要解决的问题

用户在使用聊天 Playground 时发现 4 个问题：

1. **思维链步骤重复显示**：每个步骤（Understanding query、Searching knowledge base 等）出现两行，因为后端每步发送 `running` + `done` 两条事件，前端未去重
2. **完成后未自动折叠**：思维链应在生成完成后自动折叠为摘要，用户点击可展开查看过程
3. **论文标题错误**：5 篇引用的 `paper_title` 都显示为 "This is an open access article published under a Creative Commons..."，PDF 元数据提取将版权声明误识别为标题
4. **引用上下文不完整**：展开引用卡片后，摘录文本内容不完整且 OCR 文本粘连

## 选择的方案

### 思维链去重 + 自动折叠（前端修复）

在 `ThinkingChain.tsx` 渲染前按 `step` 字段去重，同一步骤保留最新状态。逻辑：

- 遍历 steps 数组，用 `Map<step, ThinkingStep>` 去重
- running → 覆盖前一个 running；done → 覆盖前一个 running
- 去重后 `allDoneLocal` 正确判断，自动折叠生效

### 论文标题修复（后端修复）

`rank_node` 中已经从数据库加载了 `Paper` 模型对象（含 Crossref/DOI 丰富后的标题），但 `paper_title` 仍取自 chunk 元数据。

修复：`paper_title` 优先使用 `paper.title`（DB），fallback 到 `src.get("paper_title")`。

### 引用上下文扩展（后端修复）

当前 `rag_service.py` 的 `query()` 方法中：
- `contexts`（给 LLM 的上下文）使用了 `full_context`（含相邻 chunks）
- `sources`（给前端的引用数据）只使用 `text[:500]`

修复：`excerpt` 也使用 `full_context` 的截断版本，让用户看到的摘录与 LLM 看到的一致。

### OCR 文本质量

依赖现有的 `clean_node` LLM 清洗，暂不额外添加正则后处理。

## 关键决策

- **去重在前端做**：后端的 running/done 双发机制是有意为之（支持实时更新），前端负责去重展示
- **标题优先用 DB 数据**：DB 中的 `Paper.title` 可能经过 Crossref API 丰富，比 PDF 启发式提取更准确
- **摘录用 full_context**：与 LLM 看到的上下文保持一致，提供更完整的引用上下文

## 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `frontend/src/components/playground/ThinkingChain.tsx` | 步骤去重逻辑 |
| `backend/app/pipelines/chat/nodes.py` (`rank_node`) | `paper_title` 优先取 `paper.title` |
| `backend/app/services/rag_service.py` (`query`) | `excerpt` 使用 `full_context` |

## 下一步

→ 直接实现修复（代码改动量小，无需详细计划）
