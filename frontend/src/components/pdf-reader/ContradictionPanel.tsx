import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { contradictionsApi, type ContradictionPair } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';

interface ContradictionPanelProps {
  projectId: number;
  paperId: number;
}

export default function ContradictionPanel({ projectId, paperId }: ContradictionPanelProps) {
  const { t } = useTranslation();

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['contradictions', projectId, paperId],
    queryFn: () => contradictionsApi.detect(projectId),
    enabled: false,
  });

  const paperContradictions = (data?.contradictions ?? []).filter(
    (c: ContradictionPair) => c.paper_a_id === paperId || c.paper_b_id === paperId,
  );

  return (
    <div className="flex h-full flex-col overflow-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">{t('contradictions.title', 'Contradictions')}</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-xs"
        >
          {isFetching ? (
            <Loader2 className="mr-1 size-3 animate-spin" />
          ) : (
            <AlertTriangle className="mr-1 size-3" />
          )}
          {isFetching
            ? t('contradictions.analyzing', 'Analyzing...')
            : t('contradictions.detect', 'Detect')}
        </Button>
      </div>

      {!data && !isFetching && (
        <EmptyState
          icon={AlertTriangle}
          title={t('contradictions.empty', 'No analysis yet')}
          description={t('contradictions.emptyDesc', 'Click Detect to find contradictory claims between this paper and others.')}
        />
      )}

      {data && paperContradictions.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
          <Badge variant="default" className="gap-1">
            {t('contradictions.noneFound', 'No contradictions found')}
          </Badge>
          <p className="text-xs text-muted-foreground">
            {t('contradictions.noneDesc', 'This paper does not contradict any other papers in the project.')}
          </p>
        </div>
      )}

      {paperContradictions.length > 0 && (
        <div className="space-y-3">
          {paperContradictions.map((c: ContradictionPair, i: number) => {
            const isPaperA = c.paper_a_id === paperId;
            const otherTitle = isPaperA ? c.paper_b_title : c.paper_a_title;
            const otherPos = isPaperA ? c.position_b : c.position_a;

            return (
              <div key={i} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Badge variant="destructive" className="text-xs">
                    {t('contradictions.contradiction', 'Contradiction')}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {t('contradictions.confidence', 'Confidence')}: {(c.confidence * 100).toFixed(0)}%
                  </span>
                </div>

                <p className="text-sm font-medium">{c.claim}</p>

                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">
                    {otherTitle}
                  </div>
                  <p className="text-sm text-red-700 dark:text-red-400">{otherPos}</p>
                </div>

                <Badge variant="secondary" className="text-xs">{c.topic}</Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
