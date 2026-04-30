import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Filter, Download, Users } from 'lucide-react';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, type SimulationNodeDatum, type SimulationLinkDatum } from 'd3-force';
import { select } from 'd3-selection';
import { drag } from 'd3-drag';
import { zoom, zoomIdentity } from 'd3-zoom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getCSSVariable } from '@/design-tokens/tokens';
import type { AuthorNetworkNode, AuthorNetworkEdge, AuthorNetworkMetrics } from '@/services/api';

export interface AuthorGraphNode extends SimulationNodeDatum {
  name: string;
  paper_count: number;
  paper_ids: number[];
  coauthors: string[];
  h_index_estimate: number;
}

export interface AuthorGraphLink extends SimulationLinkDatum<AuthorGraphNode> {
  source: string | AuthorGraphNode;
  target: string | AuthorGraphNode;
  collaboration_count: number;
}

interface AuthorNetworkViewProps {
  nodes: AuthorNetworkNode[];
  edges: AuthorNetworkEdge[];
  metrics: AuthorNetworkMetrics;
  isLoading?: boolean;
  error?: string | null;
  onNodeClick?: (node: AuthorNetworkNode) => void;
}

function GraphSkeleton() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function AuthorNetworkView({
  nodes,
  edges,
  metrics,
  isLoading,
  error,
  onNodeClick,
}: AuthorNetworkViewProps) {
  const { t } = useTranslation();
  const [selectedNode, setSelectedNode] = useState<AuthorGraphNode | null>(null);
  const [minCollaborations, setMinCollaborations] = useState(1);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<ReturnType<typeof forceSimulation<AuthorGraphNode>> | null>(null);

  const graphData = useMemo(() => {
    const filteredEdges = edges.filter(e => e.collaboration_count >= minCollaborations);
    const connectedNames = new Set<string>();
    for (const e of filteredEdges) {
      connectedNames.add(typeof e.source === 'string' ? e.source : (e.source as AuthorGraphNode).name);
      connectedNames.add(typeof e.target === 'string' ? e.target : (e.target as AuthorGraphNode).name);
    }

    const filteredNodes = nodes
      .filter(n => connectedNames.has(n.name) || nodes.some(other => other.name !== n.name))
      .slice(0, 100);

    return { nodes: filteredNodes.map(n => ({ ...n })), edges: filteredEdges.map(e => ({ ...e })) };
  }, [nodes, edges, minCollaborations]);

  const getNodeColor = useCallback((node: AuthorGraphNode): string => {
    if (node.paper_count >= 10) return getCSSVariable('--primary') || 'oklch(0.585 0.233 293)';
    if (node.paper_count >= 5) return getCSSVariable('--chart-3') || '#22c55e';
    if (node.paper_count >= 3) return getCSSVariable('--chart-2') || '#3b82f6';
    return getCSSVariable('--muted-foreground') || '#94a3b8';
  }, []);

  function getNodeRadius(node: AuthorGraphNode): number {
    return Math.log10(node.paper_count + 1) * 5 + 5;
  }

  const handleNodeClick = useCallback((node: AuthorGraphNode) => {
    if (onNodeClick) {
      onNodeClick({
        name: node.name,
        paper_count: node.paper_count,
        paper_ids: node.paper_ids,
        coauthors: node.coauthors,
        h_index_estimate: node.h_index_estimate,
      });
    } else {
      setSelectedNode(node);
    }
  }, [onNodeClick]);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || !graphData.nodes.length) return;

    const svg = select(svgRef.current);
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    svg.attr('width', width).attr('height', height);
    svg.selectAll('*').remove();

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

    const links = linkGroup
      .selectAll('line')
      .data(graphData.edges)
      .join('line')
      .attr('stroke', getCSSVariable('--chart-1') || '#93c5fd')
      .attr('stroke-width', d => Math.max(1, Math.min(d.collaboration_count * 1.5, 6)))
      .attr('stroke-opacity', 0.6);

    const nodeContainer = nodeGroup
      .selectAll<SVGGElement, AuthorGraphNode>('g')
      .data(graphData.nodes)
      .join('g')
      .attr('cursor', 'pointer')
      .on('click', (_, d) => handleNodeClick(d));

    nodeContainer
      .append('circle')
      .attr('r', d => getNodeRadius(d))
      .attr('fill', d => getNodeColor(d))
      .attr('stroke', 'white')
      .attr('stroke-width', 1.5);

    nodeContainer
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', d => getNodeRadius(d) + 14)
      .attr('fill', getCSSVariable('--muted-foreground') || '#94a3b8')
      .attr('font-size', '10px')
      .text(d => {
        const parts = d.name.split(' ');
        return parts.length > 2 ? `${parts[0]} ${parts[parts.length - 1]}` : d.name;
      });

    nodeContainer
      .append('title')
      .text(d => `${d.name}\nPapers: ${d.paper_count}\nCo-authors: ${d.coauthors.length}\nh-index est: ${d.h_index_estimate}`);

    const dragBehavior = drag<SVGGElement, AuthorGraphNode>()
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

    const sim = forceSimulation<AuthorGraphNode>(graphData.nodes)
      .force('link', forceLink<AuthorGraphNode, AuthorGraphLink>(graphData.edges)
        .id(d => d.name)
        .distance(80)
        .strength(0.5))
      .force('charge', forceManyBody<AuthorGraphNode>().strength(-300).theta(0.8))
      .force('center', forceCenter(0, 0))
      .force('collide', forceCollide<AuthorGraphNode>().radius(d => getNodeRadius(d) + 4))
      .alphaMin(0.001)
      .on('tick', () => {
        links
          .attr('x1', d => (d.source as AuthorGraphNode).x ?? 0)
          .attr('y1', d => (d.source as AuthorGraphNode).y ?? 0)
          .attr('x2', d => (d.target as AuthorGraphNode).x ?? 0)
          .attr('y2', d => (d.target as AuthorGraphNode).y ?? 0);

        nodeContainer.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);
      });

    simulationRef.current = sim;

    return () => {
      sim.stop();
      simulationRef.current = null;
    };
  }, [graphData, getNodeColor, handleNodeClick, onNodeClick]);

  const handleExportSvg = useCallback(() => {
    if (!svgRef.current) return;
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'author-network.svg';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  if (isLoading) return <GraphSkeleton />;

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <p>{error}</p>
      </div>
    );
  }

  if (!nodes.length || metrics.total_edges === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <Users className="size-12 opacity-30" />
        <p>{t('authorNetwork.empty', 'No collaboration data found. Add more papers to the project.')}</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-xs">
          {graphData.nodes.length} {t('authorNetwork.authors', 'authors')}
        </Badge>
        <Badge variant="outline" className="text-xs">
          {graphData.edges.length} {t('authorNetwork.collaborations', 'collaborations')}
        </Badge>
        <Badge variant="outline" className="text-xs">
          {t('authorNetwork.density', 'Density')}: {metrics.density}
        </Badge>
      </div>

      <div className="absolute left-3 top-12 z-10 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <Filter className="size-3" />
          {t('authorNetwork.minCollab', 'Min collab')}:
          <select
            value={minCollaborations}
            onChange={e => setMinCollaborations(Number(e.target.value))}
            className="rounded border border-border bg-background px-1 py-0.5 text-xs"
          >
            {[1, 2, 3, 4, 5].map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-xs"
          onClick={handleExportSvg}
        >
          <Download className="mr-1 size-3" />
          {t('authorNetwork.exportSvg', 'Export SVG')}
        </Button>
      </div>

      <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1">
        <div className="flex items-center gap-2 rounded-md bg-background/80 px-2 py-1 text-xs text-muted-foreground backdrop-blur">
          <span className="inline-block size-2 rounded-full" style={{ backgroundColor: getCSSVariable('--primary') || '#6366f1' }} /> 10+ papers
          <span className="inline-block size-2 rounded-full bg-emerald-500" /> 5-9 papers
          <span className="inline-block size-2 rounded-full bg-blue-500" /> 3-4 papers
          <span className="inline-block size-2 rounded-full bg-muted-foreground/40" /> 1-2 papers
        </div>
      </div>

      <svg ref={svgRef} className="h-full w-full" />

      {selectedNode && (
        <div className="absolute right-3 top-20 z-20 w-64 rounded-lg border border-border bg-background p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{selectedNode.name}</h3>
            <button
              onClick={() => setSelectedNode(null)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close author details"
            >
              &times;
            </button>
          </div>
          <dl className="space-y-1 text-xs">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t('authorNetwork.papers', 'Papers')}</dt>
              <dd className="font-medium">{selectedNode.paper_count}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t('authorNetwork.coAuthors', 'Co-authors')}</dt>
              <dd className="font-medium">{selectedNode.coauthors.length}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t('authorNetwork.hIndex', 'h-index est')}</dt>
              <dd className="font-medium">{selectedNode.h_index_estimate}</dd>
            </div>
          </dl>
          {selectedNode.coauthors.length > 0 && (
            <div className="mt-2">
              <dt className="mb-1 text-xs text-muted-foreground">{t('authorNetwork.topCoauthors', 'Co-authors')}</dt>
              <div className="max-h-24 overflow-y-auto">
                {selectedNode.coauthors.slice(0, 8).map(name => (
                  <div key={name} className="truncate text-xs">{name}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
