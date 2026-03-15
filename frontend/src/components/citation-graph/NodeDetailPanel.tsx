import { useTranslation } from 'react-i18next';
import { X, ExternalLink, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import type { GraphNode } from './CitationGraphView';

interface NodeDetailPanelProps {
  node: GraphNode;
  projectId: number;
  onClose: () => void;
}

export default function NodeDetailPanel({ node, projectId, onClose }: NodeDetailPanelProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="absolute right-0 top-0 z-20 h-full w-80 overflow-y-auto border-l border-border bg-background/95 p-4 shadow-lg backdrop-blur">
      <div className="mb-4 flex items-start justify-between">
        <h3 className="text-sm font-semibold leading-tight">{node.title}</h3>
        <Button size="icon" variant="ghost" className="size-6 shrink-0" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="space-y-3">
        {node.year && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{t('papers.citationGraph.year', '年份')}:</span>
            <Badge variant="outline" className="text-xs">{node.year}</Badge>
          </div>
        )}

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{t('papers.citationGraph.citations', '引用数')}:</span>
          <span className="font-medium text-foreground">{node.citation_count}</span>
        </div>

        {node.authors && node.authors.length > 0 && (
          <div className="text-sm text-muted-foreground">
            <span>{t('papers.citationGraph.authors', '作者')}:</span>
            <p className="mt-1 text-foreground">{node.authors.join(', ')}</p>
          </div>
        )}

        {node.is_local && (
          <Badge variant="secondary" className="text-green-600">
            {t('papers.citationGraph.inLibrary', '已在知识库中')}
          </Badge>
        )}

        <div className="flex flex-col gap-2 pt-2">
          {node.is_local && node.paper_id && (
            <Button
              size="sm"
              variant="outline"
              className="justify-start"
              onClick={() => navigate(`/projects/${projectId}/papers`)}
            >
              <BookOpen className="mr-2 size-4" />
              {t('papers.citationGraph.viewPaper', '查看论文')}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="justify-start"
            asChild
          >
            <a
              href={`https://www.semanticscholar.org/paper/${node.s2_id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="mr-2 size-4" />
              {t('papers.citationGraph.viewOnS2', '在 Semantic Scholar 查看')}
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
