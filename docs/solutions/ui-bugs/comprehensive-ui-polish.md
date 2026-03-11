---
title: "Comprehensive UI Polish — Skeleton, PageTransition, Responsive, and Consistency"
date: 2026-03-12
category: ui-bugs
tags:
  - ui-polish
  - skeleton
  - page-transition
  - responsive
  - framer-motion
  - dark-mode
  - empty-state
  - playground
  - settings
severity: medium
component:
  - frontend/src/components/layout/AppShell
  - frontend/src/components/layout/MobileBottomNav
  - frontend/src/components/layout/MobileMenuSheet
  - frontend/src/components/layout/PageHeader
  - frontend/src/components/layout/PageTransition
  - frontend/src/components/playground/ChatInput
  - frontend/src/components/ui/empty-state
  - frontend/src/components/ui/skeleton
  - frontend/src/pages/PlaygroundPage
  - frontend/src/pages/SettingsPage
  - frontend/src/pages/ChatHistoryPage
  - frontend/src/pages/KnowledgeBasesPage
  - frontend/src/pages/project/TasksPage
  - frontend/src/index.css
symptoms: |
  Spinner-only loading states; no page transition animations; inconsistent page headers and empty states across Tasks, KnowledgeBases, ChatHistory; Playground template cards too small with no icons; ChatInput lacked toolbar (model selector, knowledge-base chips); Settings showed Mock-only fields; dark mode had weak card borders and low contrast; no responsive layout (sidebar always visible, no mobile nav).
root_cause: |
  Iterative feature development without a shared design system. Visual review exposed gaps in visual consistency, interaction feedback, feature completeness, and responsive behavior. No skeleton screens, unified page structure, or mobile-first layout.
resolution_summary: "3-phase polish — skeleton/PageTransition/motion/responsive infra, PageHeader/EmptyState consistency, Playground/Settings/ChatInput enhancements and dark mode fixes."
---

# Comprehensive UI Polish

## Problem

Before the polish, the Omelette UI had several consistency and UX issues:

- **Inconsistent loading states** — Pages used generic `LoadingState` spinners instead of content-aware skeletons, which felt slow and unpolished.
- **No page transitions** — Route changes were instant with no animation, so navigation felt abrupt.
- **Inconsistent page headers** — TasksPage lacked a subtitle and description; header layout varied across pages.
- **Basic empty states** — KnowledgeBasesPage used a custom empty state instead of the shared `EmptyState`; action buttons had no variant control.
- **Basic Playground UX** — Quick template cards were small and lacked icons; input area had no integrated toolbar; KB selection lived in the header.
- **Settings gaps** — Mock provider still showed "Test Connection"; no `max_tokens` input.
- **Dark mode issues** — Borders, inputs, and primary colors had low contrast.
- **No responsive layout** — Sidebar was always visible; no mobile navigation.

## Solution

### Phase 1 — Infrastructure

1. **Skeleton components** — Installed shadcn/ui `skeleton` and `sheet`. Created compound skeletons in `skeletons.tsx`: `CardSkeleton`, `ListItemSkeleton`, `TableSkeleton`, `SettingsSkeleton`, `PageHeaderSkeleton`.

2. **Page transitions** — `PageTransition` component uses Framer Motion `pageTransition` variants. `AppShell` wraps `Outlet` with `AnimatePresence mode="wait"` and `PageTransition` keyed by `location.pathname`.

3. **Shared motion variants** — `src/lib/motion.ts` exports `fadeIn`, `slideUp`, `staggerContainer`, `staggerItem`, `pageTransition`, `scaleOnHover` for consistent animation across all pages.

4. **Responsive hooks** — `useMediaQuery(query)`, `useIsMobile()`, `useIsTablet()`, `useIsDesktop()`, `useBreakpoint()`, and `useReducedMotion()` for accessibility.

### Phase 2 — Consistency

1. **PageHeader** — Shared component with title, optional subtitle, optional action slot. Applied to TasksPage, ChatHistoryPage, KnowledgeBasesPage, SettingsPage.

2. **EmptyState enhancement** — Added `action.variant` (`'default' | 'outline'`). KnowledgeBasesPage switched from custom layout to shared `EmptyState`.

3. **Skeleton replacements** — Replaced all `LoadingState` spinners: KnowledgeBasesPage → `CardSkeleton`, ChatHistoryPage → `ListItemSkeleton`, TasksPage → `TableSkeleton`, SettingsPage → `SettingsSkeleton`.

4. **Stagger animations** — TasksPage table rows and SettingsPage cards wrapped with `staggerContainer` / `staggerItem` variants.

### Phase 3 — Feature Enhancement

1. **Playground quick templates** — Larger cards with icons per mode, colored backgrounds, hover scale effects, responsive 2-column grid.

2. **ChatInput toolbar** — ToolModeSelector moved from header into input area. KB selection chips with remove button. Attachment icon button (Paperclip).

3. **Settings** — Test Connection hidden for mock provider. Added `max_tokens` input.

4. **Dark mode CSS** — Adjusted `--border`, `--input`, `--primary`, `--ring`, `--sidebar-border`, `--sidebar-primary` for improved contrast in `.dark` theme.

5. **Responsive navigation** — `MobileBottomNav` (fixed bottom tab bar) + `MobileMenuSheet` (Sheet with settings/theme/language). AppShell hides `IconSidebar` on mobile, adds `pb-16` for bottom nav safe area.

6. **i18n** — Added translation keys (`tasks.subtitle`, `tasks.noTasksDesc`, `settings.maxTokens`, `nav.more`) to both `en.json` and `zh.json`.

## Key Patterns Established

| Pattern | Usage |
|---------|-------|
| **Compound skeletons** | `CardSkeleton`, `ListItemSkeleton`, `TableSkeleton`, `SettingsSkeleton` instead of generic spinners |
| **PageTransition** | `AnimatePresence mode="wait"` + `PageTransition key={pathname}` in AppShell |
| **Shared motion variants** | Import from `@/lib/motion` for consistent durations/easings |
| **PageHeader** | `title` + optional `subtitle` + optional `action` for all pages |
| **EmptyState with variant** | `action.variant: 'default'` for primary, `'outline'` for secondary |
| **Breakpoint hooks** | `useIsMobile()`, `useIsTablet()`, `useIsDesktop()` instead of raw media queries |
| **Responsive shell** | Mobile: hide sidebar, show bottom nav, use Sheet for secondary actions |
| **i18n** | All copy via `useTranslation()` and locale files |

## Prevention & Best Practices

### New Page Checklist

- [ ] **Layout**: Outer `h-full p-6`; inner `mx-auto max-w-3xl space-y-6`
- [ ] **Header**: Use `PageHeader` with title, optional subtitle, optional action
- [ ] **Loading**: Use appropriate `*Skeleton` instead of spinner
- [ ] **Empty**: Use `EmptyState` with icon, title, description, optional action
- [ ] **Colors**: Semantic tokens (`border-border`, `text-muted-foreground`, `bg-card`)
- [ ] **i18n**: All text via `useTranslation()` and locale files
- [ ] **Motion**: Use variants from `@/lib/motion`; avoid ad-hoc durations
- [ ] **Responsive**: Use breakpoint hooks when layout differs by screen size
- [ ] **Mobile nav**: Primary pages → `MobileBottomNav`; secondary → `MobileMenuSheet`

### Extending Patterns

- **New skeleton**: Add to `src/components/ui/skeletons.tsx`, match the real content layout
- **New motion variant**: Add to `src/lib/motion.ts`, keep durations 0.2–0.25s with `easeOut`
- **New breakpoint hook**: Add to `src/hooks/use-breakpoint.ts` using `useMediaQuery`

## Testing Considerations

- Use Playwright `toHaveScreenshot()` at key breakpoints (375px, 768px, 1280px) in both light/dark
- Capture skeleton states by mocking slow API responses
- Capture empty states with no data
- Test mobile navigation: bottom nav visibility, Sheet open/close, sidebar hiding

## Related Documentation

- [UX 架构升级脑暴](../../brainstorms/2026-03-11-ux-architecture-upgrade-brainstorm.md)
- [前端 UI 大修计划](../../plans/2026-03-11-feat-frontend-ui-overhaul-plan.md)
- [前端 UX 健壮性脑暴](../../brainstorms/2026-03-12-frontend-ux-robustness-brainstorm.md)
- [代码质量审计修复](../compound-issues/codebase-quality-audit-4-batch-remediation.md)
- [综合 UI 打磨脑暴](../../brainstorms/2026-03-12-comprehensive-ui-polish-brainstorm.md)
