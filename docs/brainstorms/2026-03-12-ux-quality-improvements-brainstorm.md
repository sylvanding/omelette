---
date: 2026-03-12
topic: ux-quality-improvements
---

# UX 体验与质量全面优化

## 我们要做什么

针对 Omelette 科研文献助手当前版本的 12+ 个体验问题进行全面优化，涵盖 UI 布局、交互设计、OCR 质量、LLM 集成、引用展示和思维链可视化等多个维度。目标是将产品从"能用"提升到"好用"。

## 问题分类与方案

### A 类：前端 UI/UX 修复（快速修复）

#### A1. PDF 上传文件名溢出
**现状**：`AddPaperDialog` 中文件名虽有 `truncate` class，但文件列表容器宽度不够导致长文件名溢出。
**方案**：给文件列表 `<ul>` 添加 `overflow-hidden`，确保 `<li>` 中 filename `<span>` 的 `min-w-0 flex-1 truncate` 生效。同时给文件大小 badge 和删除按钮固定宽度。

#### A2. 返回按钮简化
**现状**：ProjectDetail 左侧边栏顶部显示完整文字 "← 返回知识库" / "← Back to Knowledge Bases"，占用过多空间。
**方案**：改为仅显示 "←" 箭头图标按钮 + Tooltip，hover 时显示完整文字。将知识库名称移到箭头右侧作为面包屑。

#### A3. Citation 卡片作者显示 `[object Object]`
**现状**：`CitationCard.tsx` 中 `formatAuthors` 函数处理了 `string[]` 和 `string`，但后端返回的 `authors` 可能是 `{name: string}[]` 对象数组。
**方案**：在 `formatAuthors` 中增加对象数组的处理逻辑：`authors.map(a => typeof a === 'object' ? a.name : a)`。

#### A4. 硬编码中文文字 → i18n 全覆盖
**现状**：部分按钮使用 `defaultValue` 写死了中文（如 "收起"、"展开全文"、"复制"、"重写"、"重试"、"停止生成"、"正在检索文献..." 等）。
**方案**：将所有 `defaultValue` 中的文字迁移到 `zh.json` 和 `en.json`，删除 `defaultValue`。涉及 `CitationCard`、`RewritePanel`、`MessageLoadingStages`、`PlaygroundPage` 等组件。

### B 类：布局与交互改进（中等工作量）

#### B1. Playground 聊天框固定底部
**现状**：`PlaygroundPage` 使用 `flex h-full flex-col` + `ScrollArea flex-1` + 输入区域。但 `AppShell` 的 `<main>` 有 `overflow-y-auto`，当内容过多时，整个页面滚动而非仅消息区域滚动，导致输入框被推出视口。
**方案**：
- 确保 PlaygroundPage 的高度精确为 `h-full`（视口高度减去侧边栏等）
- 给 `<main>` 在 Playground 页面时移除 `overflow-y-auto`，改由 PlaygroundPage 内部的 `ScrollArea` 控制滚动
- 或更简单：给 PlaygroundPage 外层 div 添加 `min-h-0`（flex 子项需要此属性才能正确收缩），并确保 ScrollArea 的高度约束正确

#### B2. 工具模式改为下拉选择器
**现状**：`ToolModeSelector` 将 4 个模式（Q&A、Citation Lookup、Review Outline、Gap Analysis）作为平铺按钮显示在聊天输入框上方，占用空间大。
**方案**：改为 Dropdown/Select 组件，显示当前选中模式的图标和名称，点击展开选项列表。每个选项包含图标、名称和描述。在底部栏只占用一个紧凑的选择器位置。

#### B3. 页面切换 Loading 闪烁
**现状**：所有页面使用 `lazy()` + `Suspense fallback={LoadingState}`，且 `AppShell` 的 `PageTransition` 使用 `AnimatePresence mode="wait"`。每次切换路由时：
1. `AnimatePresence` 等待旧页面退出动画
2. 新页面 lazy load 触发 `Suspense` fallback（LoadingState）
3. 新页面加载后播放入场动画
**方案**：
- 预加载核心页面（Playground、KnowledgeBasesPage）或使用 `React.startTransition`
- 将 `AnimatePresence mode="wait"` 改为 `mode="sync"` 或移除
- 减少 `pageTransition` 动画的 `exit` 时长

#### B4. 聊天历史常驻侧边栏
**现状**：聊天历史是独立的 `/history` 页面，用户需要离开 Playground 才能查看和切换对话。
**方案**：在 Playground 页面左侧添加常驻历史侧边栏（类似 ChatGPT）：
- 默认展开，显示最近的对话列表（标题、时间、工具模式 badge）
- 可通过按钮折叠为窄条，释放聊天区域空间
- 点击对话直接在右侧加载，无需路由跳转
- 顶部有"新对话"按钮和搜索框
- 保留独立的 `/history` 页面用于高级管理（批量删除等）
- 宽度约 260px，折叠后约 0px（完全隐藏）

### C 类：后端质量提升（较大工作量）

#### C1. OCR 模型升级
**现状**：使用 PaddleOCR 3.x，配置为 `lang="en"`，未启用文档方向分类和矫正。提取的学术 PDF 文字质量差（缺空格、单词粘连、特殊符号丢失）。
**方案**（推荐 Approach B）：

**Approach A: 升级 PaddleOCR 配置**
- 启用 `use_doc_orientation_classify=True`、`use_doc_unwarping=True`
- 切换到 PP-OCRv4 高精度模型
- 添加后处理：空格恢复、连字符处理
- 优点：改动小，依赖不变
- 缺点：PaddleOCR 对英文学术文档效果有上限

**Approach B: 引入 Marker/Surya 作为高质量后端**
- 使用 `marker-pdf`（基于 Surya OCR + Layout 分析）
- 专为学术 PDF 设计，保留段落结构、公式、表格
- 输出 Markdown 格式，天然适合 RAG 分块
- 保留 PaddleOCR 作为 fallback
- 优点：质量飞跃式提升
- 缺点：额外依赖（但 pip install 即可）

**Approach C: 使用 GOT-OCR2.0（多模态 OCR）**
- 基于视觉大模型的端到端 OCR
- 对复杂排版效果好
- 缺点：GPU 显存要求高，推理慢

**推荐 Approach B**：Marker/Surya 是目前学术 PDF 解析的最佳方案，安装简单，效果大幅提升。

#### C2. 引用上下文增强 + LLM 并行改写
**现状**：
1. RAG 检索返回的 excerpt 只有单个 chunk（~1024 字符），缺少前后文
2. OCR 提取的文本质量差导致 excerpt 不可读
3. 每次改写需要用户手动点击，且串行执行

**方案**：
- **上下文增强**：检索时不仅返回匹配 chunk，还返回其前后各 1 个相邻 chunk 作为 context window，合并后作为完整引用
- **自动 LLM 清洗**：在后端 `_stream_chat` 中，对每个 citation 的 excerpt 使用 LLM 进行清洗（修复 OCR 错误、添加空格、恢复格式）
- **并行执行**：使用 `asyncio.gather()` 并行处理所有 citation 的 LLM 清洗，在 citation SSE 事件后立即发送清洗版本
- 新增 SSE 事件类型 `citation_enhanced`，前端收到后更新对应 citation 的 excerpt

#### C3. 切换到真实 LLM
**现状**：`.env` 中 `LLM_PROVIDER=volcengine`，但 `config.py` 中默认可能还是 mock。需要确保后端正确读取 `.env` 配置。
**方案**：
- 检查 `config.py` 中 `LLM_PROVIDER` 的默认值，确保它是从环境变量读取的
- 验证 Volcengine (doubao-seed-2-0-mini-260215) 的 API 连通性
- 确保 embedding 也使用真实模型（`BAAI/bge-m3`）而非 mock

#### C4. 思维链（Thinking Chain）优化
**现状**：`MessageLoadingStages` 只有 3 个简单阶段：searching → citations → generating。没有详细的执行信息和兜底策略。
**方案**：设计更精细的思维链展示：

```
阶段 1: 🔍 理解问题 → 分析用户意图和关键实体
阶段 2: 📚 检索知识库 → "在 {kb_name} 中搜索..." → "找到 {n} 条相关文献"
阶段 3: 🔬 分析引用 → "正在评估引用相关性..." → "已筛选 {m} 条高质量引用"
阶段 4: ✨ 清洗引用文本 → "并行优化 {m} 条引用的可读性..."
阶段 5: 💡 生成回答 → "基于 {m} 条引用，使用 {model} 生成回答..."
阶段 6: ✅ 完成 → 显示总用时和引用数
```

- 后端在每个阶段发送 `thinking_step` SSE 事件
- 前端显示为可折叠的步骤列表，展示每步的输入/输出/耗时
- 兜底：任何阶段超时（5s）或出错，显示友好提示并跳过，确保主流程不阻塞
- 每步结束后记录耗时（ms），在完成阶段汇总展示

## 为什么选择这个方案

1. **分层执行**：A 类（快速修复）可立即执行，B 类（中等改进）一天内完成，C 类（质量提升）可并行推进
2. **用户体验优先**：先解决最影响使用的问题（聊天框固定、loading 闪烁、mock→真实 LLM）
3. **YAGNI 原则**：每个方案只解决当前具体问题，不过度设计

## 关键决策

- **OCR**: 采用 marker-pdf（基于 Surya），保留 PaddleOCR 作为 fallback
- **工具模式**: 改为下拉选择器，更紧凑且可扩展
- **历史记录**: 常驻左侧栏（类似 ChatGPT），可折叠
- **思维链**: 后端驱动的详细步骤列表（可折叠），每步显示耗时和结果摘要
- **引用清洗**: 聊天时自动并行清洗所有引用（用户无感知）
- **LLM 配置**: 直接读取 .env 中的 volcengine 配置

## 已解决的问题

1. marker-pdf 在当前 GPU 环境（CUDA 6,7）上的兼容性 → marker-pdf 支持 GPU 加速，兼容 CUDA，需在实施时验证
2. 思维链事件格式 → 使用独立的 `thinking_step` SSE 事件类型，不与 A2UI 协议耦合，保持简单
3. 引用清洗并发 → 使用独立 `asyncio.Semaphore(3)` 限制并发，避免影响主聊天流

## 下一步

→ `/ce:plan` 制定详细实施计划
