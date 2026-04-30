import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trendsApi } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';
import TrendsView from '@/components/trends/TrendsView';

interface TrendsDialogProps {
  projectId: number;
  onClose: () => void;
}

export function TrendsDialog({
  projectId,
  onClose,
}: TrendsDialogProps) {
  const { t } = useTranslation();

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.trends.all(projectId),
    queryFn: () => trendsApi.get(projectId),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative h-[85vh] w-[90vw] max-w-6xl rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-lg font-semibold">
            {t('trends.title', 'Research trend analysis')}
          </h2>
          <Button
            size="icon"
            variant="ghost"
            onClick={onClose}
            aria-label={t('trends.close', 'Close trend analysis')}
          >
            <X className="size-5" />
          </Button>
        </div>
        <div className="h-[calc(100%-56px)] overflow-hidden">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <TrendsView
              publicationTimeline={data?.publication_timeline ?? []}
              topicTrends={data?.topic_trends ?? []}
              emergingTopics={data?.emerging_topics ?? []}
              decliningTopics={data?.declining_topics ?? []}
              summaryStats={data?.summary_stats ?? {
                total_papers: 0,
                year_span: 0,
                first_year: null,
                last_year: null,
                total_topics: 0,
                emerging_count: 0,
                declining_count: 0,
              }}
              error={error instanceof Error ? error.message : null}
            />
          )}
        </div>
      </div>
    </div>
  );
}
