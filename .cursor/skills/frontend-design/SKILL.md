---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality. Use when building web components, pages, or applications. Generates creative, polished code that avoids generic AI aesthetics. Triggers on "beautify", "redesign", "UI polish", "frontend design", "make it look good".
---

# Frontend Design for Omelette

## Stack
React 18 + TypeScript + TailwindCSS v4 + shadcn/ui + Radix + lucide-react + D3.js

## Design Direction: Scientific Editorial
Omelette is a scientific literature assistant. The UI should feel like a **modern research tool** — clean, information-dense but not cluttered, with editorial precision.

- **Tone**: Refined academic + modern SaaS. Think Notion meets Google Scholar.
- **Color**: Purple/blue primary (`#6C5CE7` style, OKLCH tokens), neutral base (slate). Dark mode with sidebar-specific tokens.
- **Typography**: `Inter` for body (legibility), monospace for metadata. Use font-weight variation for hierarchy, not color.
- **Spacing**: Generous whitespace between sections, tight within cards. 4px grid system.
- **Motion**: CSS transitions preferred. Framer Motion only in PlaygroundPage chat animations.
- **Layout**: `PageLayout` for page structure, `DualSidebar` for navigation (context-aware panels), `DataTable` for tabular data.
- **API URLs**: Always use `apiUrl()` / `wsUrl()` from `@/lib/api-config.ts`.

## Component Patterns

### Cards
```tsx
<Card className="group hover:shadow-md transition-shadow border-border/50">
  <CardHeader className="pb-3">
    <CardTitle className="text-sm font-medium leading-snug line-clamp-2">
      {title}
    </CardTitle>
  </CardHeader>
</Card>
```

### Text Overflow
Always use `truncate`, `line-clamp-*`, or `break-all` for user-generated content:
```tsx
<span className="truncate block max-w-full">{filename}</span>
<p className="line-clamp-3">{abstract}</p>
```

### Loading States
Use skeleton loaders over spinners. Show progress bars for multi-step operations:
```tsx
<Progress value={progress} className="h-1.5" />
```

### Empty States
Never show blank pages. Always provide an illustration or call-to-action:
```tsx
<div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
  <FileText className="h-12 w-12 mb-4 opacity-40" />
  <p className="text-sm">No papers yet. Upload PDFs or search to get started.</p>
</div>
```

## Anti-patterns
- No `overflow: hidden` without `title` tooltip on truncated text
- No raw error messages in UI — wrap in user-friendly toast
- No layout shift from loading states
- No unstyled scrollbars in dark mode
- Never hardcode Chinese/English strings — always use `useTranslation()`
