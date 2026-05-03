import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  X, Loader2, Network, Download, Filter, User,
} from 'lucide-react';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, type SimulationNodeDatum, type SimulationLinkDatum } from 'd3-force';
import { select } from 'd3-selection';
import { drag } from 'd3-drag';
import { zoom, zoomIdentity } from 'd3-zoom';
import { scaleLinear } from 'd3-scale';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getCSSVariable } from '@/design-tokens/tokens';
import { authorNetworkApi } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';

interface AuthorNetworkDialogProps {
  projectId: number;
  onClose: () => void;
}

interface SimNode extends SimulationNodeDatum {
  name: string;
  paper_count: number;
  paper_ids: number[];
  coauthors: string[];
  h_index_estimate: number;
  centrality: number;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  source: string | SimNode;
  target: string | SimNode;
  collaboration_count: number;
}

function AuthorDetailPanel({
  node,
  onClose,
}: {
  node: SimNode;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="absolute right-0 top-0 z-20 h-full w-72 border-l bg-background/95 backdrop-blur shadow-xl overflow-y-auto">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="font-semibold text-sm truncate" title={node.name}>{node.name}</h3>
        <Button size="icon" variant="ghost" className="size-6" onClick={onClose}>
          <X className="size-3" />
        </Button>
      </div>
      <div className="space-y-4 p-4">
        <div>
          <p className="text-xs text-muted-foreground">{t('authorNetwork.papers', 'Papers')}</p>
          <p className="text-lg font-bold">{node.paper_count}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t('authorNetwork.hIndex', 'H-index (est.)')}</p>
          <p className="text-lg font-bold">{node.h_index_estimate}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t('authorNetwork.centrality', 'Centrality')}</p>
          <p className="text-lg font-bold">{node.centrality.toFixed(3)}</p>
        </div>
        {node.coauthors.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">{t('authorNetwork.coAuthors', 'Co-authors')}</p>
            <div className="flex flex-wrap gap-1">
              {node.coauthors.slice(0, 10).map((name) => (
                <Badge key={name} variant="outline" className="text-xs">{name}</Badge>
              ))}
              {node.coauthors.length > 10 && (
                <Badge variant="outline" className="text-xs">+{node.coauthors.length - 10}</Badge>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function AuthorNetworkDialog({ projectId, onClose }: AuthorNetworkDialogProps) {
  const { t } = useTranslation();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const [selectedNode, setSelectedNode] = useState<SimNode | null>(null);
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<ReturnType<typeof forceSimulation<SimNode>> | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.authorNetwork.all(projectId),
    queryFn: () => authorNetworkApi.get(projectId),
  });

  const handleExportPNG = useCallback(() => {
    if (!svgRef.current) return;
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      ctx.fillStyle = getCSSVariable('--background') || '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      const link = document.createElement('a');
      link.download = 'author-network.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = url;
  }, []);

  // D3 force graph rendering
  useEffect(() => {
    if (!svgRef.current || !containerRef.current || !data || !data.nodes.length) return;

    const svg = select(svgRef.current);
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    svg.attr('width', width).attr('height', height);
    svg.selectAll('*').remove();

    // Prepare graph data
    let nodes: SimNode[] = data.nodes.map((n) => ({ ...n, centrality: 0, x: undefined, y: undefined }));
    let edges: SimLink[] = data.edges.map((e) => ({ ...e }));

    // Filter: active only = authors with coauthors
    if (showActiveOnly) {
      const activeNames = new Set(data.edges.flatMap((e) => [e.source, e.target]));
      nodes = nodes.filter((n) => activeNames.has(n.name));
      const nodeNames = new Set(nodes.map((n) => n.name));
      edges = edges.filter((e) => nodeNames.has(e.source as string) && nodeNames.has(e.target as string));
    }

    if (!nodes.length) return;

    // Compute centrality from edge participation
    const degree: Record<string, number> = {};
    for (const e of edges) {
      const s = typeof e.source === 'string' ? e.source : e.source.name;
      const tgt = typeof e.target === 'string' ? e.target : e.target.name;
      degree[s] = (degree[s] || 0) + 1;
      degree[tgt] = (degree[tgt] || 0) + 1;
    }
    const maxDegree = Math.max(...Object.values(degree), 1);
    for (const node of nodes) {
      node.centrality = (degree[node.name] || 0) / maxDegree;
    }

    const defs = svg.append('defs');
    defs.append('marker')
      .attr('id', 'arrow-collab')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 15)
      .attr('refY', 0)
      .attr('markerWidth', 5)
      .attr('markerHeight', 5)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', getCSSVariable('--chart-1') || '#93c5fd');

    const g = svg.append('g');

    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    svg.call(zoomBehavior);
    svg.call(zoomBehavior.transform, zoomIdentity.translate(width / 2, height / 2));

    const linkGroup = g.append('g').attr('class', 'links');
    const nodeGroup = g.append('g').attr('class', 'nodes');

    const radiusScale = scaleLinear()
      .domain([1, Math.max(...nodes.map((n) => n.paper_count), 1)])
      .range([5, 20]);

    const colorScale = scaleLinear<string>()
      .domain([0, 1])
      .range(
        [
          getCSSVariable('--muted-foreground') || '#94a3b8',
          getCSSVariable('--primary') || 'oklch(0.585 0.233 293)',
        ],
      );

    const links = linkGroup
      .selectAll<SVGLineElement, SimLink>('line')
      .data(edges)
      .join('line')
      .attr('stroke', getCSSVariable('--chart-1') || '#93c5fd')
      .attr('stroke-width', (d) => Math.max(1, Math.min(d.collaboration_count, 5)))
      .attr('stroke-opacity', 0.5);

    const nodeContainer = nodeGroup
      .selectAll<SVGGElement, SimNode>('g')
      .data(nodes)
      .join('g')
      .attr('cursor', 'pointer')
      .on('click', (_, d) => setSelectedNode(d));

    nodeContainer
      .append('circle')
      .attr('r', (d) => radiusScale(d.paper_count))
      .attr('fill', (d) => colorScale(d.centrality))
      .attr('stroke', 'white')
      .attr('stroke-width', 1.5);

    nodeContainer
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => radiusScale(d.paper_count) + 14)
      .attr('fill', getCSSVariable('--foreground') || '#0f172a')
      .attr('font-size', '10px')
      .attr('font-weight', '500')
      .text((d) => {
        const name = d.name;
        return name.length > 20 ? name.slice(0, 18) + '…' : name;
      });

    nodeContainer
      .append('title')
      .text((d) => `${d.name}\nPublications: ${d.paper_count}\nH-index: ${d.h_index_estimate}`);

    const dragBehavior = drag<SVGGElement, SimNode>()
      .on('start', (event, d) => {
        if (!event.active) simulationRef.current?.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulationRef.current?.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    nodeContainer.call(dragBehavior);

    const sim = forceSimulation<SimNode>(nodes)
      .force('link', forceLink<SimNode, SimLink>(edges)
        .id((d) => d.name)
        .distance(80)
        .strength(0.4))
      .force('charge', forceManyBody<SimNode>().strength(-300).theta(0.8))
      .force('center', forceCenter(0, 0))
      .force('collide', forceCollide<SimNode>().radius((d) => radiusScale(d.paper_count) + 4))
      .alphaMin(0.001)
      .on('tick', () => {
        links
          .attr('x1', (d) => (d.source as SimNode).x ?? 0)
          .attr('y1', (d) => (d.source as SimNode).y ?? 0)
          .attr('x2', (d) => (d.target as SimNode).x ?? 0)
          .attr('y2', (d) => (d.target as SimNode).y ?? 0);

        nodeContainer.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
      });

    simulationRef.current = sim;

    return () => {
      sim.stop();
      simulationRef.current = null;
    };
  }, [data, showActiveOnly]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative flex h-[90vh] w-[95vw] max-w-5xl flex-col rounded-xl border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <Network className="size-5 text-primary" />
            <h2 className="text-lg font-semibold">{t('authorNetwork.title', 'Author Network')}</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              onClick={handleExportPNG}
              disabled={!data?.nodes.length}
            >
              <Download className="size-3" />
              {t('authorNetwork.exportPNG', 'Export PNG')}
            </Button>
            <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close">
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/* Toolbar */}
        {data && (
          <div className="flex items-center gap-2 border-b px-6 py-2">
            <Badge variant="outline" className="text-xs">
              {data.nodes.length} {t('authorNetwork.authors', 'authors')}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {data.edges.length} {t('authorNetwork.collaborations', 'collaborations')}
            </Badge>
            {data.metrics && data.metrics.density !== undefined && (
              <Badge variant="secondary" className="text-xs">
                {t('authorNetwork.density', 'Density')}: {data.metrics.density.toFixed(3)}
              </Badge>
            )}
            <Button
              size="sm"
              variant={showActiveOnly ? 'default' : 'outline'}
              className="h-6 text-xs gap-1"
              onClick={() => setShowActiveOnly(!showActiveOnly)}
            >
              <Filter className="size-3" />
              {t('authorNetwork.activeOnly', 'Active only')}
            </Button>
          </div>
        )}

        {/* Graph area */}
        <div ref={containerRef} className="relative flex-1">
          {isLoading && (
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="size-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">{t('authorNetwork.loading', 'Building author network...')}</p>
              </div>
            </div>
          )}

          {isError && !data && (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <p>{t('authorNetwork.error', 'Failed to load author network. Please try again.')}</p>
            </div>
          )}

          {data && data.nodes.length === 0 && !isLoading && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <User className="size-8" />
              <p className="text-sm">{t('authorNetwork.empty', 'No author data available. Add papers with author information to see the network.')}</p>
            </div>
          )}

          <svg ref={svgRef} className="h-full w-full" />

          {selectedNode && (
            <AuthorDetailPanel
              node={selectedNode}
              onClose={() => setSelectedNode(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
