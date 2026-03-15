import { lazy, Suspense, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, ZoomIn, ZoomOut, Maximize, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import NodeDetailPanel from './NodeDetailPanel';

const ForceGraph2D = lazy(() => import('react-force-graph-2d'));

export interface GraphNode {
  id: string;
  title: string;
  year: number | null;
  citation_count: number;
  is_local: boolean;
  s2_id: string;
  authors?: string[];
  paper_id?: number;
  x?: number;
  y?: number;
}

export interface GraphLink {
  source: string;
  target: string;
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

  const graphData = useMemo(() => {
    let nodes = data.nodes;
    let edges = data.edges;

    if (showLocalOnly) {
      const localIds = new Set(nodes.filter((n) => n.is_local).map((n) => n.id));
      localIds.add(data.center_id ?? '');
      nodes = nodes.filter((n) => localIds.has(n.id));
      edges = edges.filter((e) => localIds.has(e.source as string) && localIds.has(e.target as string));
    }

    return { nodes, links: edges };
  }, [data, showLocalOnly]);

  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNode(node);
  }, []);

  const nodeColor = useCallback((node: GraphNode) => {
    if (node.id === data.center_id) return '#ef4444';
    if (node.is_local) return '#22c55e';
    if (node.year && node.year >= 2020) return '#3b82f6';
    return '#94a3b8';
  }, [data.center_id]);

  const nodeVal = useCallback((node: GraphNode) => {
    return Math.log10((node.citation_count || 0) + 1) * 6 + 2;
  }, []);

  const linkColor = useCallback((link: GraphLink) => {
    return link.type === 'cites' ? '#93c5fd' : '#fdba74';
  }, []);

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
        <p>{t('papers.citationGraph.empty', '暂无引用关系数据')}</p>
      </div>
    );
  }

  const localCount = data.nodes.filter((n) => n.is_local).length;

  return (
    <div className="relative h-full w-full">
      <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-xs">
          {data.nodes.length} {t('papers.citationGraph.nodes', '节点')}
        </Badge>
        <Badge variant="outline" className="text-xs">
          {data.edges.length} {t('papers.citationGraph.edges', '连接')}
        </Badge>
        {localCount > 0 && (
          <Badge variant="secondary" className="text-xs text-green-600">
            {localCount} {t('papers.citationGraph.local', '本地')}
          </Badge>
        )}
        <Button
          size="sm"
          variant={showLocalOnly ? 'default' : 'outline'}
          className="h-6 text-xs"
          onClick={() => setShowLocalOnly(!showLocalOnly)}
        >
          <Filter className="mr-1 size-3" />
          {t('papers.citationGraph.localOnly', '仅本地')}
        </Button>
      </div>

      <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1">
        <div className="flex items-center gap-2 rounded-md bg-background/80 px-2 py-1 text-xs text-muted-foreground backdrop-blur">
          <span className="inline-block size-2 rounded-full bg-red-500" /> 中心
          <span className="inline-block size-2 rounded-full bg-green-500" /> 本地
          <span className="inline-block size-2 rounded-full bg-blue-500" /> 近年
          <span className="inline-block size-2 rounded-full bg-slate-400" /> 其他
        </div>
      </div>

      <Suspense fallback={<GraphSkeleton />}>
        <ForceGraph2D
          graphData={graphData}
          nodeId="id"
          nodeLabel={(node: GraphNode) => `${node.title}\n(${node.year ?? '?'}) 引用:${node.citation_count}`}
          nodeVal={nodeVal}
          nodeColor={nodeColor}
          linkSource="source"
          linkTarget="target"
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={1}
          linkColor={linkColor}
          linkWidth={1}
          onNodeClick={handleNodeClick}
          cooldownTicks={100}
          width={undefined}
          height={undefined}
        />
      </Suspense>

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
