---
date: 2026-03-12
topic: comprehensive-ui-polish
---

# Omelette 综合性 UI 打磨

## 我们要构建什么

基于对应用所有页面的可视化截图审查，对 Omelette 前端进行全面打磨，覆盖 **视觉一致性、交互流畅性、功能补全、响应式适配** 四个维度。目标是让应用达到 Perplexity 级别的专业感——搜索+对话融合、引用卡片突出、信息密度适中。

最终效果：截图可直接放产品介绍页，所有交互有动画反馈，所有页面风格统一，桌面/平板/手机均可用。

## 为什么选择这个方案

### 考虑过的方案

| 方案 | 描述 | 取舍 |
|------|------|------|
| **A: 按技术层分阶段（选中）** | 基础设施 → 一致性 → 功能增强 | 依赖清晰，代码复用好，但阶段 1 用户可见变化小 |
| B: 按用户感知分阶段 | 首页体验 → 全局打磨 → 深度功能 | 成果感强但可能返工 |
| C: 按页面分阶段 | 逐页完整打磨 | 简单但共享组件可能重复开发 |

**选择方案 A 的理由：**
- 骨架屏、页面过渡、响应式断点等基础设施是所有页面共享的，先做避免后续改
- 一致性修复是收益最高的投入——统一标题区域、空状态、动画模式即可大幅提升整体感
- 功能增强（输入框、Settings、暗色模式）是锦上添花，放最后不阻塞其他工作

## 可视化审查发现

### 已有的好设计
- 左侧图标侧边栏已有 Tooltip
- Framer Motion 已安装并在 3 个页面使用
- 共享 EmptyState 组件已存在
- 暗色模式基本可用
- shadcn/ui 组件库已有 17 个组件

### 需要改进的问题

| 页面 | 问题 |
|------|------|
| **Playground** | 快捷模板卡片太小无图标、输入框功能单一、欢迎区视觉重心偏上 |
| **Tasks** | 与其他页面设计语言不一致（无副标题、无页面描述） |
| **Settings** | 无动态表单（Mock 模式不应显示 Test Connection）、缺 API Key 配置 |
| **暗色模式** | 卡片边框不可见、输入框区分度不够、品牌色偏暗淡 |
| **全局** | 无骨架屏（只有 spinner）、无页面过渡动画、空状态不统一、未做响应式适配 |

## 关键决策

### 1. 设计参考：Perplexity 风格
- **决策**：以 Perplexity 为视觉参考，而非 ChatGPT 或 Notion
- **理由**：Perplexity 的"搜索+对话+引用"模式与 Omelette 的科研文献场景高度匹配
- **影响**：快捷模板卡片需更突出、引用相关的视觉元素需加强

### 2. 分阶段策略：基础设施 → 一致性 → 功能增强
- **阶段 1 - 基础设施层**：Skeleton 组件、页面过渡动画框架、响应式断点系统、Framer Motion 工具函数
- **阶段 2 - 页面一致性层**：统一标题区域/空状态/加载状态、Tasks 页面修复、Framer Motion 扩展到所有页面
- **阶段 3 - 功能增强层**：Playground 输入框/卡片升级、Settings 动态表单、暗色模式优化、响应式适配

### 3. 响应式设计：完全响应式
- **决策**：手机/平板/桌面三端均完全可用
- **断点**：移动端隐藏侧边栏改为底部导航或汉堡菜单，平板横屏使用折叠侧边栏

### 4. 骨架屏替代 Spinner
- **决策**：新增 Skeleton 组件，所有数据加载用骨架屏而非 Loader2 spinner
- **理由**：骨架屏减少感知加载时间，更专业

### 5. 页面过渡动画方案
- **决策**：使用 Framer Motion AnimatePresence + 路由级包裹
- **方式**：淡入淡出（fade）为主，避免滑动（slide）以保持轻量感

## 详细改进清单

### 阶段 1：基础设施层

#### 1.1 新增 Skeleton 组件
- 安装 shadcn/ui skeleton 组件
- 创建常用骨架模式：CardSkeleton、ListSkeleton、PageHeaderSkeleton
- 用于 Knowledge Bases、Chat History、Tasks 等列表页

#### 1.2 页面过渡动画框架
- 在 App.tsx 的路由层包裹 AnimatePresence
- 创建 PageTransition 包裹组件（fade + 微滑入）
- 所有页面统一使用

#### 1.3 响应式断点系统
- 定义断点：`sm: 640px`、`md: 768px`、`lg: 1024px`、`xl: 1280px`
- 创建 useMediaQuery hook
- 侧边栏响应式：桌面固定、平板折叠、手机隐藏
- 移动端导航方案（底部 tab 或汉堡菜单）

#### 1.4 Framer Motion 工具函数
- 统一动画变体（fadeIn、slideUp、staggerChildren）
- 创建 MotionList、MotionCard 等封装组件
- 统一 duration、easing 参数

### 阶段 2：页面一致性层

#### 2.1 统一页面标题区域
- 所有页面采用统一的 PageHeader 组件：标题 + 副标题 + 可选操作按钮
- 修复 Tasks 页面（加副标题和描述）

#### 2.2 统一空状态
- 所有页面使用 EmptyState 组件（KnowledgeBasesPage 的自定义空状态改为使用统一组件）
- EmptyState 增强：支持 action 按钮的变体（primary/outline）

#### 2.3 统一加载状态
- 将所有 LoadingState（spinner）替换为 Skeleton 骨架屏
- 保留 spinner 仅用于按钮内 loading 和提交操作

#### 2.4 Framer Motion 扩展
- 将 motion 动画从 3 个页面扩展到所有 8 个页面
- 列表页：stagger 入场动画
- 卡片页：hover scale + shadow 过渡

### 阶段 3：功能增强层

#### 3.1 Playground 快捷模板升级
- 卡片增大，加入独特图标和淡色背景
- 每个模板卡片有自己的品牌色（Search=蓝、Citation=绿、Outline=紫、Gap=红）
- hover 效果增强

#### 3.2 Playground 输入框增强
- 知识库选择 chip 显示在输入框内/上方
- 模型选择下拉
- 附件上传按钮（PDF 拖拽）
- 工具模式入口整合（移到输入框上方或内部）

#### 3.3 Settings 动态表单
- 根据 Provider 类型动态显示/隐藏配置字段
- API Key 输入框（密码类型，可切换显示）
- 未保存变更提示（Save 按钮状态变化）

#### 3.4 暗色模式优化
- 卡片边框可见性：`border-border/30` → `border-border/50`
- 输入框区分度：用略浅的 `bg-muted/30` 背景
- 品牌色提亮：暗色模式下 amber-500 → amber-400
- 快捷模板卡片 hover 效果增强

#### 3.5 响应式适配实施
- 侧边栏：移动端底部导航 + 汉堡菜单
- Playground：输入框全宽、快捷模板单列
- Knowledge Bases：卡片网格 3→2→1 列
- Settings：表单单列堆叠
- Chat History：搜索框全宽、列表紧凑

## 技术约束

- **不引入新依赖**：仅用已有的 shadcn/ui + Framer Motion + TailwindCSS v4
- **渐进增强**：每个阶段独立可用，不破坏现有功能
- **i18n**：所有新增文案必须走 `useTranslation()`
- **可访问性**：保持 Radix UI 的 ARIA 属性，新增组件遵循 WAI-ARIA 规范

## 已解决的问题

1. **移动端侧边栏方案** → **混合方案**：底部 Tab 放主要导航（Chat、Knowledge Bases、History、Tasks），汉堡菜单放次要功能（Settings、主题切换、语言切换）
2. **页面过渡动画性能** → **支持 `prefers-reduced-motion` 降级**：尊重用户系统设置，运动障碍用户自动禁用动画
3. **Settings API Key 存储** → **两种方式都支持**：前端可配置 API Key（存后端数据库），也可通过 .env 配置，前端配置优先级高于 .env

## 下一步

→ 确认方向后，执行 `/ce:plan` 生成详细实施计划并开始编码
