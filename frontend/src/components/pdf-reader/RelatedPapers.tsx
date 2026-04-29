import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { paperApi } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';

interface RelatedPapersProps {
  projectId: number;
  paperId: number;
}

export default function RelatedPapers({ projectId, paperId }: RelatedPapersProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { data: relatedPapers, isLoading } = useQuery({
    queryKey: queryKeys.papers.related(projectId, paperId),
    queryFn: () => paperApi.getRelated(projectId, paperId),
    enabled: !!projectId && !!paperId,
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!relatedPapers || relatedPapers.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
        <p className="text-sm text-muted-foreground">
          {t('papers.related.empty', 'No related papers found')}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('papers.related.emptyHint', 'Index paper content to enable semantic similarity matching')}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-auto">
      <div className="space-y-3 p-3">
        {relatedPapers.map((paper) => (
          <div
            key={paper.id}
            className="rounded-lg border border-border/50 bg-card p-3 transition-colors hover:bg-accent/50"
          >
            <div className="flex items-start justify-between gap-2">
              <button
                className="text-left text-sm font-medium leading-snug hover:underline"
                onClick={() => navigate(`/projects/${projectId}/papers/${paper.id}`)}
              >
                {paper.title}
              </button>
              <Badge variant="info" className="shrink-0 text-xs">
                {paper.similarity_score}%
              </Badge>
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {paper.authors.length > 0 && (
                <span className="truncate">
                  {paper.authors.slice(0, 3).join(', ')}
                  {paper.authors.length > 3 ? ' et al.' : ''}
                </span>
              )}
              {paper.year && (
                <Badge variant="outline" className="shrink-0 text-xs">
                  {paper.year}
                </Badge>
              )}
            </div>

            {paper.journal && (
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {paper.journal}
                {paper.citation_count > 0 && (
                  <span className="ml-1">
                    &middot; {paper.citation_count} {t('papers.citations', 'citations')}
                  </span>
                )}
              </p>
            )}

            <div className="mt-2 flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => navigate(`/projects/${projectId}/papers/${paper.id}`)}
              >
                <ExternalLink className="mr-1 size-3" />
                {t('papers.readPdf', 'Read PDF')}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
