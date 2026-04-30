import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { gapApi } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';
import GapAnalysisPanel from '@/components/gap-analysis/GapAnalysisPanel';

interface GapAnalysisDialogProps {
  projectId: number;
  onClose: () => void;
}

export function GapAnalysisDialog({
  projectId,
  onClose,
}: GapAnalysisDialogProps) {
  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.gaps.all(projectId),
    queryFn: () => gapApi.analyze(projectId),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative h-[85vh] w-[90vw] max-w-6xl rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-lg font-semibold">
            {t('gaps.title', 'Literature gap analysis')}
          </h2>
          <Button
            size="icon"
            variant="ghost"
            onClick={onClose}
            aria-label={t('gaps.close', 'Close gap analysis')}
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
            <GapAnalysisPanel
              gaps={data?.gaps ?? []}
              researchQuestions={data?.research_questions ?? []}
              totalGaps={data?.summary.total_gaps ?? 0}
              totalQuestions={data?.summary.total_questions ?? 0}
            />
          )}
        </div>
      </div>
    </div>
  );
}
