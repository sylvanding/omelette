# Writing API

路径：`/api/v1/projects/{project_id}/writing`

## 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /projects/{id}/writing/assist | 通用写作辅助 |
| POST | /projects/{id}/writing/summarize | 摘要 |
| POST | /projects/{id}/writing/citations | 引用生成 |
| POST | /projects/{id}/writing/review-outline | 综述提纲 |
| POST | /projects/{id}/writing/gap-analysis | 缺口分析 |

## Assist 请求

`task`：`summarize`、`cite`、`review_outline`、`gap_analysis`；`style` 用于引用样式。

## 引用样式

`gb_t_7714`、`apa`、`mla`

---

## 文献综述生成（流式）

### POST /api/v1/projects/{project_id}/writing/review-draft/stream

通过 SSE（Server-Sent Events）流式生成结构化文献综述。

**请求体：**

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| topic | string | "" | 综述主题（空则自动检测） |
| style | string | "narrative" | 综述风格：narrative（叙述式）、systematic（系统式）、thematic（主题式） |
| citation_format | string | "numbered" | 引用格式：numbered、apa、gb_t_7714 |
| language | string | "zh" | 输出语言：zh（中文）、en（英文） |

**SSE 事件：**

| 事件 | 数据 | 说明 |
|------|------|------|
| progress | {step, message} | 进度更新 |
| outline | {sections: string[]} | 生成的大纲 |
| section-start | {title, section_index} | 章节开始生成 |
| text-delta | {delta, section_index} | 文本增量 |
| section-end | {section_index} | 章节生成完成 |
| citation-map | {citations: {...}} | 引用映射 |
| done | {total_sections} | 生成完成 |
| error | {message} | 发生错误 |
