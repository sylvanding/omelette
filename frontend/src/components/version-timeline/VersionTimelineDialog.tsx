import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { versionTrackingApi } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';
import { useToastMutation } from '@/hooks/use-toast-mutation';
import VersionTimeline from './VersionTimeline';

interface VersionTimelineDialogProps {
  projectId: number;
  paperId: number;
  paperTitle: string;
  onClose: () => void;
}

export function VersionTimelineDialog({
  projectId,
  paperId,
  paperTitle,
  onClose,
}: VersionTimelineDialogProps) {
  const { t } = useTranslation();

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.paperVersions.all(projectId, paperId),
    queryFn: () => versionTrackingApi.getVersions(projectId, paperId),
  });

  const checkMutation = useToastMutation({
    mutationFn: () => versionTrackingApi.checkForUpdates(projectId, paperId),
    invalidateKeys: [queryKeys.paperVersions.all(projectId, paperId)],
  });

  const handleCheckUpdates = () => {
    checkMutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative h-[75vh] w-[480px] max-w-full rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold truncate">
              {t('versions.title', 'Version History')}
            </h2>
            <p className="line-clamp-1 text-xs text-muted-foreground">{paperTitle}</p>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label={t('common.close', 'Close')}>
            <X className="size-4" />
          </Button>
        </div>
        <div className="h-[calc(100%-56px)] overflow-hidden">
          <VersionTimeline
            projectId={projectId}
            paperId={paperId}
            versions={data?.versions ?? []}
            isLoading={isLoading}
            error={error instanceof Error ? error : null}
            onCheckUpdates={handleCheckUpdates}
            isCheckingUpdates={checkMutation.isPending}
          />
        </div>
      </div>
    </div>
  );
}
