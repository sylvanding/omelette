import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Loader2,
  ShieldCheck,
  Wrench,
  Tag,
  Layers,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { libraryApi } from '@/services/api';
import type { PaperCluster } from '@/services/api';

type TabKey = 'health' | 'repair' | 'tag' | 'cluster';

export default function LibraryPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId);

  const [activeTab, setActiveTab] = useState<TabKey>('health');

  const { data: healthResponse, isLoading: isLoadingHealth, refetch: refetchHealth } = useQuery({
    queryKey: ['library-health', pid],
    queryFn: () => libraryApi.health(pid),
    enabled: !!pid && activeTab === 'health',
  });

  const repairMutation = useMutation({
    mutationFn: () => libraryApi.repair(pid),
  });

  const tagMutation = useMutation({
    mutationFn: () => libraryApi.autoTag(pid),
  });

  const clusterMutation = useMutation({
    mutationFn: () => libraryApi.clusters(pid),
  });

  const handleRepair = useCallback(() => {
    repairMutation.mutate();
  }, [repairMutation]);

  const handleAutoTag = useCallback(() => {
    tagMutation.mutate();
  }, [tagMutation]);

  const handleCluster = useCallback(() => {
    clusterMutation.mutate();
  }, [clusterMutation]);

  const issueColor = (count: number) => {
    if (count >= 4) return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    if (count >= 2) return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
  };

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'health', label: t('library.healthCheck'), icon: <ShieldCheck className="size-4" /> },
    { key: 'repair', label: t('library.repairMetadata'), icon: <Wrench className="size-4" /> },
    { key: 'tag', label: t('library.autoTag'), icon: <Tag className="size-4" /> },
    { key: 'cluster', label: t('library.clusterPapers'), icon: <Layers className="size-4" /> },
  ];

  return (
    <div>
      {/* Tab navigation */}
      <div className="mb-6 flex gap-2 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Health Check Tab */}
      {activeTab === 'health' && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldCheck className="size-5 text-primary" />
              <div>
                <h2 className="text-lg font-semibold">{t('library.health.title')}</h2>
                <p className="text-sm text-muted-foreground">
                  {t('library.health.subtitle')}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetchHealth()}>
              <RefreshCw className="mr-2 size-4" />
              {t('library.health.refresh')}
            </Button>
          </div>

          {isLoadingHealth && (
            <div className="flex items-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              {t('library.health.scanning')}
            </div>
          )}

          {healthResponse && (
            <>
              {/* Summary cards */}
              <div className="mb-6 grid grid-cols-3 gap-4">
                <SummaryCard
                  label={t('library.health.totalPapers')}
                  value={healthResponse.total_papers}
                  color="text-foreground"
                />
                <SummaryCard
                  label={t('library.health.healthy')}
                  value={healthResponse.healthy_papers}
                  color="text-green-500"
                />
                <SummaryCard
                  label={t('library.health.withIssues')}
                  value={healthResponse.papers_with_issues}
                  color={healthResponse.papers_with_issues > 0 ? 'text-red-500' : 'text-green-500'}
                />
              </div>

              {/* Issue list */}
              {healthResponse.issues.length > 0 ? (
                <div className="space-y-3">
                  {healthResponse.issues.map((issue) => (
                    <div
                      key={issue.paper_id}
                      className="flex items-center justify-between rounded-lg border bg-card p-4"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{issue.title}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {issue.issues.map((i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {i.replace(/_/g, ' ')}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <Badge className={issueColor(issue.issue_count)}>
                        {t('library.health.issueCount', { count: issue.issue_count, plural: issue.issue_count !== 1 ? 's' : '' })}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
                  <CheckCircle2 className="size-12 text-green-500" />
                  <p className="text-sm">{t('library.health.allOk')}</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Repair Metadata Tab */}
      {activeTab === 'repair' && (
        <div>
          <div className="mb-4 flex items-center gap-3">
            <Wrench className="size-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">{t('library.repair.title')}</h2>
              <p className="text-sm text-muted-foreground">
                {t('library.repair.subtitle')}
              </p>
            </div>
          </div>

          <div className="mb-6 rounded-lg border bg-card p-6">
            <p className="mb-4 text-sm text-muted-foreground">
              {t('library.repair.description')}
            </p>
            <Button
              onClick={handleRepair}
              disabled={repairMutation.isPending}
            >
              {repairMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              {repairMutation.isPending ? t('library.repair.repairing') : t('library.repair.start')}
            </Button>
          </div>

          {repairMutation.isSuccess && repairMutation.data && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <SummaryCard
                  label={t('library.repair.attempted')}
                  value={repairMutation.data.total_attempted}
                  color="text-foreground"
                />
                <SummaryCard
                  label={t('library.repair.repaired')}
                  value={repairMutation.data.success_count}
                  color="text-green-500"
                />
                <SummaryCard
                  label={t('library.repair.failed')}
                  value={repairMutation.data.failure_count}
                  color={repairMutation.data.failure_count > 0 ? 'text-red-500' : 'text-green-500'}
                />
              </div>

              {repairMutation.data.repaired.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">{t('library.repair.successTitle')}</h3>
                  {repairMutation.data.repaired.slice(0, 10).map((p) => (
                    <div
                      key={p.paper_id}
                      className="flex items-center gap-2 rounded-lg border bg-card p-3"
                    >
                      <CheckCircle2 className="size-4 text-green-500 shrink-0" />
                      <span className="truncate text-sm">{p.title}</span>
                    </div>
                  ))}
                </div>
              )}

              {repairMutation.data.failed.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">{t('library.repair.failedTitle')}</h3>
                  {repairMutation.data.failed.map((f) => (
                    <div
                      key={f.paper_id}
                      className="flex items-center gap-2 rounded-lg border bg-card p-3"
                    >
                      <XCircle className="size-4 text-red-500 shrink-0" />
                      <span className="text-sm">Paper {f.paper_id}: {f.reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Auto-Tag Tab */}
      {activeTab === 'tag' && (
        <div>
          <div className="mb-4 flex items-center gap-3">
            <Tag className="size-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">{t('library.tag.title')}</h2>
              <p className="text-sm text-muted-foreground">
                {t('library.tag.subtitle')}
              </p>
            </div>
          </div>

          <div className="mb-6 rounded-lg border bg-card p-6">
            <p className="mb-4 text-sm text-muted-foreground">
              {t('library.tag.description')}
            </p>
            <Button onClick={handleAutoTag} disabled={tagMutation.isPending}>
              {tagMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              {tagMutation.isPending ? t('library.tag.analyzing') : t('library.tag.generate')}
            </Button>
          </div>

          {tagMutation.isSuccess && tagMutation.data && (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                {t('library.tag.resultsDesc', { count: tagMutation.data.total_tagged })}
              </p>
              <div className="space-y-3">
                {tagMutation.data.tags.map((t) => (
                  <div
                    key={t.paper_id}
                    className="rounded-lg border bg-card p-4"
                  >
                    <p className="mb-2 text-sm font-medium">{t('library.tag.paperLabel', { id: t.paper_id })}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {t.suggested_tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Cluster Papers Tab */}
      {activeTab === 'cluster' && (
        <div>
          <div className="mb-4 flex items-center gap-3">
            <Layers className="size-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">{t('library.cluster.title')}</h2>
              <p className="text-sm text-muted-foreground">
                {t('library.cluster.subtitle')}
              </p>
            </div>
          </div>

          <div className="mb-6 rounded-lg border bg-card p-6">
            <p className="mb-4 text-sm text-muted-foreground">
              {t('library.cluster.description')}
            </p>
            <Button onClick={handleCluster} disabled={clusterMutation.isPending}>
              {clusterMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              {clusterMutation.isPending ? t('library.cluster.clustering') : t('library.cluster.analyze')}
            </Button>
          </div>

          {clusterMutation.isSuccess && clusterMutation.data && (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                {t('library.cluster.resultsCount', { count: clusterMutation.data.total_clusters })}
              </p>
              <div className="space-y-4">
                {clusterMutation.data.clusters.map((cluster: PaperCluster) => (
                  <div
                    key={cluster.name}
                    className="rounded-lg border bg-card p-4"
                  >
                    <h3 className="mb-1 text-base font-semibold">{cluster.name}</h3>
                    <p className="mb-3 text-sm text-muted-foreground">{cluster.description}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {cluster.paper_ids.map((id) => (
                        <Badge key={id} variant="outline" className="text-xs">
                          {t('library.cluster.paperBadge', { id })}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color = 'text-foreground' }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
