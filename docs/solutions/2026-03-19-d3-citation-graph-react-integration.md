# D3.js v7 + React 19 Citation Graph Integration Research

**Date:** 2026-03-19
**Context:** Replacing `react-force-graph-2d` with custom D3 implementation for Omelette citation/reference graph
**Stack:** React 19.2, D3 v7.9, TypeScript, Vite 7, TailwindCSS v4 (purple design system)

---

## 1. React + D3 Integration Patterns

### Two Main Approaches

| Approach | Description | Pros | Cons |
|----------|-------------|------|------|
| **D3 for rendering** | D3 owns the DOM; React provides a container ref | Best performance; no React reconciliation during ticks | Harder to wire React state (click → panel); D3 mutates nodes |
| **D3 for layout, React for rendering** | D3 runs simulation; React renders SVG from node positions | Easy React event handlers; fits React mental model | Performance overhead from React re-renders on every tick |

### Recommendation for Citation Graph (100–500 nodes)

**Use D3 for rendering** — the standard pattern for force graphs:

1. **Performance**: Force simulation fires 60+ ticks/sec during animation. React re-rendering on each tick is costly; D3 direct DOM updates are much faster.
2. **D3 mutates nodes**: `forceSimulation` adds `x`, `y`, `vx`, `vy` to nodes. React prefers immutability; keeping layout in D3 avoids conflicts.
3. **Event bridging**: Use D3's `.on('click', ...)` and call a React callback (e.g. `onNodeClick`) to update React state. React only re-renders when selection changes, not on every tick.

```tsx
// Recommended: D3 owns SVG, React provides container + callbacks
function D3CitationGraph({ data, onNodeClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);

  useEffect(() => {
    if (!containerRef.current || !data.nodes.length) return;
    const svg = d3.select(containerRef.current).select('svg');
    // D3 creates/updates nodes, links, zoom, drag
    // On node click: onNodeClick?.(node)
    return () => { simulationRef.current?.stop(); };
  }, [data, onNodeClick]);

  return (
    <div ref={containerRef} className="h-full w-full">
      <svg width="100%" height="100%" />
    </div>
  );
}
```

**When to use "D3 layout + React render"**: Only if you need heavy React-specific behavior (e.g. each node is a complex React component with forms, nested state). For a citation graph with circles, lines, and tooltips, D3 rendering is preferable.

---

## 2. d3-force Simulation: Best Practices for Citation Graphs

### Force Configuration for Academic Citation Networks

Citation graphs are directed (A cites B). D3's link force is symmetric; direction is visual (arrows), not physical.

**Recommended forces:**

```typescript
const simulation = d3.forceSimulation(nodes)
  .force('link', d3.forceLink(links)
    .id((d) => d.id)
    .distance(80)           // Shorter = denser; 80–120 for 100–500 nodes
    .strength(0.5)          // 0.3–0.7; lower = more flexible
    .iterations(1))         // 1 is default; increase for rigid lattices
  .force('charge', d3.forceManyBody()
    .strength(-400)         // -200 to -600 for 100–500 nodes
    .theta(0.8))            // Barnes–Hut; 0.8 = faster, less accurate
  .force('center', d3.forceCenter(width / 2, height / 2))
  .force('collide', d3.forceCollide()
    .radius((d) => (d as GraphNode).radius ?? 12)
    .strength(0.8))
  .alphaMin(0.001)
  .alphaDecay(0.0228)
  .velocityDecay(0.4)
  .on('tick', ticked);
```

### Parameter Tuning for 100–500 Nodes

| Parameter | Small (100) | Medium (250) | Large (500) |
|-----------|-------------|--------------|-------------|
| `charge.strength` | -300 | -400 | -500 |
| `link.distance` | 100 | 80 | 60 |
| `charge.theta` | 0.9 | 0.8 | 0.7 |
| `alphaDecay` | 0.02 | 0.0228 | 0.025 |

### Directional Edges (Citation Arrows)

D3-force does not model direction. Render arrows via SVG markers:

```typescript
// In defs
svg.append('defs').selectAll('marker')
  .data(['cites', 'cited_by'])
  .join('marker')
  .attr('id', (d) => `arrow-${d}`)
  .attr('viewBox', '0 -5 10 10')
  .attr('refX', 12)
  .attr('refY', 0)
  .attr('markerWidth', 6)
  .attr('markerHeight', 6)
  .attr('orient', 'auto')
  .append('path')
  .attr('d', 'M0,-5L10,0L0,5')
  .attr('fill', (d) => d === 'cites' ? 'var(--chart-1)' : 'var(--chart-2)');

// On each link line
link.attr('marker-end', (d) => `url(#arrow-${d.type})`);
```

### Large Graph Optimizations

- **Barnes–Hut theta**: `forceManyBody().theta(0.7)` reduces O(n²) to O(n log n).
- **alphaMin**: `simulation.alphaMin(0.001)` stops simulation earlier.
- **Fixed center node**: Set `node.fx = centerX; node.fy = centerY` for the focal paper to stabilize layout.
- **Cooldown**: After initial layout, call `simulation.alphaTarget(0)` to let it settle.

---

## 3. SVG vs Canvas Rendering

### When to Use Each

| Criterion | SVG | Canvas |
|----------|-----|--------|
| **Node count** | &lt; 500 | &gt; 500 |
| **DOM events** | Native (click, hover) | Manual hit-testing |
| **Accessibility** | Better (semantic elements) | Poor |
| **Zoom/pan** | `d3.zoom` + `transform` on `<g>` | Redraw with transform |
| **Performance** | DOM overhead per element | Single draw call |

### Performance Thresholds

- **&lt; 200 nodes**: SVG is fine; 60 FPS achievable.
- **200–500 nodes**: SVG acceptable with optimizations (reduce DOM nodes, use `will-change`).
- **&gt; 500 nodes**: Prefer Canvas; SVG typically drops to 3–4 FPS at 10k elements.

### Hybrid Approach (SVG for Small, Canvas for Large)

```typescript
const NODE_THRESHOLD = 400;
const useCanvas = data.nodes.length > NODE_THRESHOLD;

return useCanvas ? (
  <canvas ref={canvasRef} width={width} height={height} />
) : (
  <svg ref={svgRef} width={width} height={height}>
    <g ref={zoomGRef}>
      <g className="links" />
      <g className="nodes" />
    </g>
  </svg>
);
```

**Recommendation for Omelette**: Use **SVG only** for 100–500 nodes. Canvas adds complexity (hit-testing, tooltips) without clear benefit in this range. Revisit if you later support 1000+ nodes.

---

## 4. Zoom/Pan Implementation

### d3-zoom with Force Graph

Apply zoom to a **wrapper `<g>`** that contains links and nodes, not the simulation. The simulation uses screen coordinates; zoom transforms the view.

```typescript
const zoomGRef = useRef<SVGGElement>(null);

useEffect(() => {
  const svg = d3.select(svgRef.current);
  const g = d3.select(zoomGRef.current);

  const zoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.2, 4])
    .on('zoom', (event) => {
      g.attr('transform', event.transform);
    });

  svg.call(zoom);

  // Optional: fit to content on load
  // svg.call(zoom.transform, d3.zoomIdentity.translate(...).scale(...));

  return () => svg.on('.zoom', null);
}, []);
```

### Zoom + Drag Conflict

- **d3.drag** on nodes: Use `filter` to avoid starting drag on zoom gestures:
  ```typescript
  d3.drag<SVGCircleElement, GraphNode>()
    .filter((event) => !event.ctrlKey && event.button === 0)
    .on('start', dragstarted)
    .on('drag', dragged)
    .on('end', dragended);
  ```
- Or apply zoom to the SVG and drag to nodes; they compose correctly.

---

## 5. Node Interaction: Click, Hover, Drag, Tooltips

### Click

```typescript
node
  .on('click', (event, d) => {
    event.stopPropagation();
    onNodeClick?.(d);
  });
```

### Hover (Highlight Adjacent)

```typescript
node
  .on('mouseover', (event, d) => {
    link.attr('stroke-opacity', (l) =>
      l.source === d || l.target === d ? 1 : 0.1);
    node.attr('opacity', (n) =>
      n === d || connected(n, d) ? 1 : 0.3);
  })
  .on('mouseout', () => {
    link.attr('stroke-opacity', 0.6);
    node.attr('opacity', 1);
  });
```

### Tooltips Without Performance Degradation

**Option A: SVG `<title>`** — Zero JS, native browser tooltip:
```typescript
node.append('title').text((d) => `${d.title}\n(${d.year}) 引用:${d.citation_count}`);
```
- Pros: No perf cost, accessible.
- Cons: Styling limited, delay before show.

**Option B: Single floating div** — One DOM element, positioned on mousemove:
```typescript
const tooltip = document.getElementById('graph-tooltip');

node
  .on('mouseover', (event, d) => {
    tooltip.textContent = `${d.title} (${d.year})`;
    tooltip.style.display = 'block';
  })
  .on('mousemove', (event) => {
    tooltip.style.left = `${event.pageX + 10}px`;
    tooltip.style.top = `${event.pageY + 10}px`;
  })
  .on('mouseout', () => {
    tooltip.style.display = 'none';
  });
```
- Pros: Full control over content and styling.
- Cons: Must throttle mousemove if needed (usually unnecessary for 100–500 nodes).

**Recommendation**: Use **Option B** with your existing `Tooltip` or a simple div. Keep content minimal (title, year, citation count) to avoid layout thrash.

### Drag

```typescript
function dragstarted(event: d3.DragEvent, d: GraphNode) {
  if (!event.active) simulation.alphaTarget(0.3).restart();
  d.fx = d.x;
  d.fy = d.y;
}

function dragged(event: d3.DragEvent, d: GraphNode) {
  d.fx = event.x;
  d.fy = event.y;
}

function dragended(event: d3.DragEvent, d: GraphNode) {
  if (!event.active) simulation.alphaTarget(0);
  d.fx = undefined;
  d.fy = undefined;
}

node.call(d3.drag<SVGCircleElement, GraphNode>()
  .on('start', dragstarted)
  .on('drag', dragged)
  .on('end', dragended));
```

---

## 6. Responsive Sizing with ResizeObserver

### Why ResizeObserver over viewBox

- **viewBox**: Uniform scaling; text scales too; aspect ratio can add padding.
- **ResizeObserver**: Explicit width/height; you control what scales; fixed font sizes possible.

### useResizeObserver Hook

```typescript
function useResizeObserver(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ width, height });
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}
```

### Integrating with Force Simulation

```typescript
const containerRef = useRef<HTMLDivElement>(null);
const { width, height } = useResizeObserver(containerRef);

useEffect(() => {
  if (width === 0 || height === 0) return;
  simulation.force('center', d3.forceCenter(width / 2, height / 2));
  simulation.alpha(0.3).restart();
}, [width, height]);
```

### SVG Dimensions

```tsx
<div ref={containerRef} className="h-full w-full min-h-[400px]">
  <svg width={width} height={height}>
    <g ref={zoomGRef}>...</g>
  </svg>
</div>
```

---

## 7. Color Theming: Purple Design System

### CSS Variables (from Omelette `index.css`)

```css
/* Light */
--primary: oklch(0.65 0.17 55);
--chart-1: oklch(0.72 0.16 55);
--chart-2: oklch(0.62 0.14 45);
--muted-foreground: oklch(0.52 0.02 60);

/* Dark */
--primary: oklch(0.78 0.16 58);
--chart-1: oklch(0.78 0.14 60);
--chart-2: oklch(0.68 0.12 50);
--muted-foreground: oklch(0.65 0.02 70);
```

### Node Coloring Strategy for Citation Graph

| Node Type | Color | CSS Variable / Value |
|-----------|-------|----------------------|
| Center (focal paper) | Strong primary | `hsl(var(--primary))` or `oklch(0.65 0.17 55)` |
| Local (in project) | Primary lighter | `oklch(0.72 0.14 55)` / `--chart-1` |
| Recent (year ≥ 2020) | Primary accent | `oklch(0.62 0.14 45)` / `--chart-2` |
| Other | Muted | `hsl(var(--muted-foreground))` |

### Edge Coloring

| Edge Type | Color | Rationale |
|-----------|-------|-----------|
| `cites` (outgoing) | `--chart-1` or primary-400 | Paper A cites B |
| `cited_by` (incoming) | `--chart-2` or primary-300 | Paper B is cited by A |

### Applying in D3

```typescript
// Read CSS variable at runtime (respects light/dark)
const getColor = (varName: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || '#6C5CE7';

node.attr('fill', (d) => {
  if (d.id === centerId) return getColor('--primary');
  if (d.is_local) return getColor('--chart-1');
  if (d.year && d.year >= 2020) return getColor('--chart-2');
  return getColor('--muted-foreground');
});

link.attr('stroke', (d) =>
  d.type === 'cites' ? getColor('--chart-1') : getColor('--chart-2'));
```

---

## 8. Complete Example Skeleton

```tsx
// D3CitationGraph.tsx
import { useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import type { GraphNode, GraphLink, GraphData } from './types';

interface Props {
  data: GraphData;
  onNodeClick?: (node: GraphNode) => void;
  width: number;
  height: number;
}

export function D3CitationGraph({ data, onNodeClick, width, height }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomGRef = useRef<SVGGElement>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);

  useEffect(() => {
    if (!svgRef.current || !data.nodes.length || width === 0 || height === 0) return;

    const svg = d3.select(svgRef.current);
    const g = d3.select(zoomGRef.current);
    const { nodes, edges: links } = data;

    // Arrow markers
    svg.select('defs').remove();
    svg.append('defs')
      .selectAll('marker')
      .data(['cites', 'cited_by'])
      .join('marker')
      .attr('id', (d) => `arrow-${d}`)
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 12)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', (d) => (d === 'cites' ? 'var(--chart-1)' : 'var(--chart-2)'));

    // Force simulation
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d) => d.id).distance(80))
      .force('charge', d3.forceManyBody().strength(-400).theta(0.8))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius(12));

    const link = g.select('.links').selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', (d) => (d.type === 'cites' ? 'var(--chart-1)' : 'var(--chart-2)'))
      .attr('stroke-opacity', 0.6)
      .attr('marker-end', (d) => `url(#arrow-${d.type})`);

    const node = g.select('.nodes').selectAll('circle')
      .data(nodes)
      .join('circle')
      .attr('r', (d) => Math.log10((d.citation_count || 0) + 1) * 4 + 4)
      .attr('fill', (d) => {
        if (d.id === data.center_id) return 'var(--primary)';
        if (d.is_local) return 'var(--chart-1)';
        if (d.year && d.year >= 2020) return 'var(--chart-2)';
        return 'var(--muted-foreground)';
      })
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended))
      .on('click', (event, d) => { event.stopPropagation(); onNodeClick?.(d); });

    function ticked() {
      link
        .attr('x1', (d) => (d.source as GraphNode).x!)
        .attr('y1', (d) => (d.source as GraphNode).y!)
        .attr('x2', (d) => (d.target as GraphNode).x!)
        .attr('y2', (d) => (d.target as GraphNode).y!);
      node
        .attr('cx', (d) => d.x!)
        .attr('cy', (d) => d.y!);
    }

    function dragstarted(event: d3.DragEvent, d: GraphNode) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }
    function dragged(event: d3.DragEvent, d: GraphNode) {
      d.fx = event.x;
      d.fy = event.y;
    }
    function dragended(event: d3.DragEvent, d: GraphNode) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = undefined;
      d.fy = undefined;
    }

    simulation.on('tick', ticked);
    simulationRef.current = simulation;

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => g.attr('transform', event.transform));
    svg.call(zoom);

    return () => {
      simulation.stop();
      simulationRef.current = null;
      svg.on('.zoom', null);
    };
  }, [data, width, height, onNodeClick]);

  return (
    <svg ref={svgRef} width={width} height={height}>
      <g ref={zoomGRef}>
        <g className="links" />
        <g className="nodes" />
      </g>
    </svg>
  );
}
```

---

## 9. References

- [D3 Force Simulation](https://d3js.org/d3-force)
- [D3 Force Link](https://d3js.org/d3-force/link)
- [D3 Zoom](https://github.com/d3/d3-zoom)
- [Omelette Phase 4 Tech Reference](../plans/2026-03-15-phase4-tech-reference.md) — d3-force basics
- [Frontend Redesign Plan](../plans/2026-03-19-feat-frontend-complete-redesign-plan.md) — D3CitationGraph task
