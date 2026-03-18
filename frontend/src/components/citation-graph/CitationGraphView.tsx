import { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Filter } from 'lucide-react';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, type SimulationNodeDatum, type SimulationLinkDatum } from 'd3-force';
import { select } from 'd3-selection';
import { drag } from 'd3-drag';
import { zoom, zoomIdentity } from 'd3-zoom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getCSSVariable } from '@/design-tokens/tokens';
import NodeDetailPanel from './NodeDetailPanel';

export interface GraphNode extends SimulationNodeDatum {
  id: string;
  title: string;
  year: number | null;
  citation_count: number;
  is_local: boolean;
  s2_id: string;
  authors?: string[];
  paper_id?: number;
}

export interface GraphLink extends SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  type: 'cites' | 'cited_by';
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphLink[];
  center_id: string | null;
  error?: string;
}

interface CitationGraphViewProps {
  data: GraphData;
  isLoading?: boolean;
  projectId: number;
}

function GraphSkeleton() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function CitationGraphView({ data, isLoading, projectId }: CitationGraphViewProps) {
  const { t } = useTranslation();
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [showLocalOnly, setShowLocalOnly] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<ReturnType<typeof forceSimulation<GraphNode>> | null>(null);

  const graphData = useMemo(() => {
    let nodes = data.nodes.map(n => ({ ...n }));
    let edges = data.edges.map(e => ({ ...e }));

    if (showLocalOnly) {
      const localIds = new Set(nodes.filter(n => n.is_local).map(n => n.id));
      localIds.add(data.center_id ?? '');
      nodes = nodes.filter(n => localIds.has(n.id));
      edges = edges.filter(e =>
        localIds.has(typeof e.source === 'string' ? e.source : e.source.id) &&
        localIds.has(typeof e.target === 'string' ? e.target : e.target.id)
      );
    }

    return { nodes, edges };
  }, [data, showLocalOnly]);

  function getNodeColor(node: GraphNode): string {
    if (node.id === data.center_id) return getCSSVariable('--primary') || 'oklch(0.585 0.233 293)';
    if (node.is_local) return getCSSVariable('--chart-3') || '#22c55e';
    if (node.year && node.year >= 2020) return getCSSVariable('--chart-2') || '#3b82f6';
    return getCSSVariable('--muted-foreground') || '#94a3b8';
  }

  function getNodeRadius(node: GraphNode): number {
    return Math.log10((node.citation_count || 0) + 1) * 4 + 4;
  }

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || !graphData.nodes.length) return;

    const svg = select(svgRef.current);
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    svg.attr('width', width).attr('height', height);
    svg.selectAll('*').remove();

    const defs = svg.append('defs');
    defs.append('marker')
      .attr('id', 'arrow-cites')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
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

    const links = linkGroup
      .selectAll('line')
      .data(graphData.edges)
      .join('line')
      .attr('stroke', (d) => d.type === 'cites' ? (getCSSVariable('--chart-1') || '#93c5fd') : (getCSSVariable('--chart-5') || '#fdba74'))
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.6)
      .attr('marker-end', 'url(#arrow-cites)');

    const nodeContainer = nodeGroup
      .selectAll<SVGGElement, GraphNode>('g')
      .data(graphData.nodes)
      .join('g')
      .attr('cursor', 'pointer')
      .on('click', (_, d) => setSelectedNode(d));

    nodeContainer
      .append('circle')
      .attr('r', d => getNodeRadius(d))
      .attr('fill', d => getNodeColor(d))
      .attr('stroke', 'white')
      .attr('stroke-width', 1.5);

    nodeContainer
      .append('title')
      .text(d => `${d.title}\n(${d.year ?? '?'}) Citations: ${d.citation_count}`);

    const dragBehavior = drag<SVGGElement, GraphNode>()
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

    const sim = forceSimulation<GraphNode>(graphData.nodes)
      .force('link', forceLink<GraphNode, GraphLink>(graphData.edges)
        .id(d => d.id)
        .distance(80)
        .strength(0.5))
      .force('charge', forceManyBody<GraphNode>().strength(-400).theta(0.8))
      .force('center', forceCenter(0, 0))
      .force('collide', forceCollide<GraphNode>().radius(d => getNodeRadius(d) + 2))
      .alphaMin(0.001)
      .on('tick', () => {
        links
          .attr('x1', d => (d.source as GraphNode).x ?? 0)
          .attr('y1', d => (d.source as GraphNode).y ?? 0)
          .attr('x2', d => (d.target as GraphNode).x ?? 0)
          .attr('y2', d => (d.target as GraphNode).y ?? 0);

        nodeContainer.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);
      });

    if (data.center_id) {
      const center = graphData.nodes.find(n => n.id === data.center_id);
      if (center) {
        center.fx = 0;
        center.fy = 0;
      }
    }

    simulationRef.current = sim;

    return () => {
      sim.stop();
      simulationRef.current = null;
    };
  }, [graphData, data.center_id]);

  if (isLoading) return <GraphSkeleton />;

  if (data.error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <p>{data.error}</p>
      </div>
    );
  }

  if (!data.nodes.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <p>{t('papers.citationGraph.empty', 'No citation data available')}</p>
      </div>
    );
  }

  const localCount = data.nodes.filter(n => n.is_local).length;

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-xs">
          {data.nodes.length} {t('papers.citationGraph.nodes', 'nodes')}
        </Badge>
        <Badge variant="outline" className="text-xs">
          {data.edges.length} {t('papers.citationGraph.edges', 'edges')}
        </Badge>
        {localCount > 0 && (
          <Badge variant="secondary" className="text-xs text-green-600">
            {localCount} {t('papers.citationGraph.local', 'local')}
          </Badge>
        )}
        <Button
          size="sm"
          variant={showLocalOnly ? 'default' : 'outline'}
          className="h-6 text-xs"
          onClick={() => setShowLocalOnly(!showLocalOnly)}
        >
          <Filter className="mr-1 size-3" />
          {t('papers.citationGraph.localOnly', 'Local only')}
        </Button>
      </div>

      <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1">
        <div className="flex items-center gap-2 rounded-md bg-background/80 px-2 py-1 text-xs text-muted-foreground backdrop-blur">
          <span className="inline-block size-2 rounded-full bg-primary" /> Center
          <span className="inline-block size-2 rounded-full bg-emerald-500" /> Local
          <span className="inline-block size-2 rounded-full" style={{ backgroundColor: getCSSVariable('--chart-2') || '#3b82f6' }} /> Recent
          <span className="inline-block size-2 rounded-full bg-muted-foreground/40" /> Other
        </div>
      </div>

      <svg ref={svgRef} className="h-full w-full" />

      {selectedNode && (
        <NodeDetailPanel
          node={selectedNode}
          projectId={projectId}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}
