# Brainstorm: DualSidebar 简化 & 项目页侧边栏重复修复

日期: 2026-03-19

## 我们要解决什么

### 问题
项目页面（`/projects/:id/*`）存在侧边栏重复：
- `DualSidebar`（全局）：icon rail + 展开面板（NavPanel / ChatHistoryPanel）
- `ProjectDetail.tsx`（项目路由）：独立 `<aside>` 渲染 ← 返回 + 项目名 + Papers/Discovery/Writing

当 DualSidebar 展开时，最多出现 3 列侧边栏。

### 设计方案

**简化 DualSidebar 为可展开的 icon rail**：
- 收起状态（默认）：仅显示图标（w-14），包含 nav 图标 + 底部工具图标
- 展开状态：icon rail 本身变宽，图标旁滑出文字标签（Chat / Knowledge Bases / History / Tasks）
- 不再有独立的第二列面板（移除 NavPanel、ChatHistoryPanel 子组件）
- 底部在语言按钮上方放置展开/收起切换按钮
- 项目页面时自动收起

保留 `ProjectDetail.tsx` 的项目子导航 aside 不变。

## 为什么选这个方案

1. **统一简洁**：所有页面只有一种侧边栏交互模式（展开/收起 icon rail）
2. **项目页不冲突**：auto-collapse 确保项目 aside 有足够空间
3. **改动量适中**：只改 DualSidebar 一个文件，删除无用的子组件
4. **用户习惯一致**：VSCode、Figma 等工具均采用类似的 icon rail 展开模式

## 关键决策

1. ✅ 移除 DualSidebar 的独立面板列 — 改为 icon rail 内联展开
2. ✅ 项目路由自动收起 — useEffect + useLocation 检测
3. ✅ 聊天历史从侧边栏移至 /history 页面 — ChatHistoryPanel 移除
4. ✅ 展开宽度约 w-48 — 足够显示图标 + 文字标签

## 附带修复

- AddPaperDialog 文件名溢出：确保 truncate 正确生效
- 聊天历史标题溢出：确保 truncate + min-w-0
