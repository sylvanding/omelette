import { useTranslation } from 'react-i18next';
import { BookOpen, Loader2, RefreshCw, ArrowUpCircle, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useQueryClient } from '@tanstack/react-query';
import { versionTrackingApi, type PaperVersionEntry } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';
import { useToastMutation } from '@/hooks/use-toast-mutation';

interface VersionTimelineProps {
  projectId: number;
  paperId: number;
  versions: PaperVersionEntry[];
  isLoading: boolean;
  error: Error | null;
  onCheckUpdates: () => void;
  isCheckingUpdates: boolean;
}

export default function VersionTimeline({
  projectId,
  paperId,
  versions,
  isLoading,
  error,
  onCheckUpdates,
  isCheckingUpdates,
}: VersionTimelineProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const upgradeMutation = useToastMutation({
    mutationFn: (versionId: number) =>
      versionTrackingApi.upgradeToVersion(projectId, paperId, versionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paper', projectId, paperId] });
      queryClient.invalidateQueries({ queryKey: queryKeys.paperVersions.all(projectId, paperId) });
    },
    successMessage: t('versions.upgradeSuccess', 'Paper upgraded to selected version'),
    errorMessage: t('versions.upgradeFailed', 'Failed to upgrade version'),
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        <p>{t('versions.loadError', 'Failed to load version history')}</p>
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
        <FileText className="size-10 text-muted-foreground/40" />
        <p className="text-center text-sm text-muted-foreground">
          {t('versions.noVersions', 'No version history available')}
        </p>
        <p className="text-center text-xs text-muted-foreground">
          {t('versions.noVersionsDesc', 'Paper versions are tracked when updates are detected from academic databases')}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={onCheckUpdates}
          disabled={isCheckingUpdates}
        >
          {isCheckingUpdates ? (
            <Loader2 className="mr-1 size-3 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 size-3" />
          )}
          {t('versions.checkForUpdates', 'Check for updates')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="sticky top-0 z-10 border-b border-border bg-background p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">{t('versions.title', 'Version History')}</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCheckUpdates}
            disabled={isCheckingUpdates}
            className="h-7 text-xs"
          >
            {isCheckingUpdates ? (
              <Loader2 className="mr-1 size-3 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 size-3" />
            )}
            {t('versions.checkForUpdates', 'Check for updates')}
          </Button>
        </div>
      </div>

      <div className="flex-1 p-4">
        <div className="relative space-y-4">
          {versions.map((v, index) => (
            <div key={v.id} className="relative pl-6">
              {/* Timeline line */}
              {index < versions.length - 1 && (
                <div className="absolute left-2.5 top-6 bottom-[-12px] w-px bg-border" />
              )}

              {/* Timeline dot */}
              <div
                className={`absolute left-0 top-1.5 flex size-5 items-center justify-center rounded-full border-2 ${
                  v.is_preprint
                    ? 'border-amber-400 bg-amber-50'
                    : 'border-blue-400 bg-blue-50'
                }`}>
                <div
                  className={`size-2 rounded-full ${
                    v.is_preprint ? 'bg-amber-400' : 'bg-blue-400'
                  }`}
                />
              </div>

              <Card className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs font-mono">
                        v{v.version}
                      </Badge>
                      {v.is_preprint ? (
                        <Badge
                          variant="secondary"
                          className="bg-amber-50 text-amber-700 hover:bg-amber-100 text-xs"
                        >
                          {v.preprint_server ?? 'Preprint'}
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs"
                        >
                          <BookOpen className="mr-1 size-3" />
                          {v.journal || 'Journal'}
                        </Badge>
                      )}
                    </div>

                    <p className="mt-1.5 line-clamp-2 text-xs font-medium leading-tight">
                      {v.title}
                    </p>

                    {v.journal && !v.is_preprint && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{v.journal}</p>
                    )}

                    {v.diff_summary && (
                      <p className="mt-1.5 text-xs text-muted-foreground italic">
                        {v.diff_summary}
                      </p>
                    )}

                    <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                      {v.year && <span>{v.year}</span>}
                      {v.citation_count > 0 && (
                        <span>{v.citation_count} citations</span>
                      )}
                      {v.created_at && (
                        <span>{new Date(v.created_at).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 h-7 text-xs"
                    onClick={() => upgradeMutation.mutate(v.id)}
                    disabled={upgradeMutation.isPending}
                    title={t('versions.upgradeToThis', 'Upgrade to this version')}
                  >
                    <ArrowUpCircle className="mr-1 size-3" />
                    {t('versions.upgrade', 'Upgrade')}
                  </Button>
                </div>
              </Card>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
