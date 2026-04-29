import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToastMutation } from '@/hooks/use-toast-mutation';
import { toast } from 'sonner';
import { FileText } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { paperApi, projectApi, paperProcessApi } from '@/services/api';
import { kbApi } from '@/services/kb-api';
import { queryKeys } from '@/lib/query-keys';
import type { Paper, PaperStatus } from '@/types';
import type { UploadResult, DedupConflictPair } from '@/services/kb-api';
import { AddPaperDialog } from '@/components/knowledge-base/AddPaperDialog';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import { DedupConflictPanel } from '@/components/knowledge-base/DedupConflictPanel';
import PageLayout from '@/components/layout/PageLayout';
import { PapersFilterBar } from './papers/PapersFilterBar';
import { PapersToolbar } from './papers/PapersToolbar';
import { usePapersColumns } from './papers/papers-columns';
import { PaperStatusBanner } from './PaperStatusBanner';
import { CitationGraphDialog } from './CitationGraphDialog';

const PROCESSING_STATUSES: PaperStatus[] = ['pdf_downloaded', 'ocr_complete'];

export default function PapersPage() {
  const { t, i18n } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();

  const queryClient = useQueryClient();
  const pid = Number(projectId!);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<PaperStatus | ''>('');
  const [year, setYear] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [expandedId, setExpandedId] = useState<string | number | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string | number>>(new Set());
  const [showAddPaper, setShowAddPaper] = useState(false);
  const [conflicts, setConflicts] = useState<DedupConflictPair[]>([]);
  const [graphPaperId, setGraphPaperId] = useState<number | null>(null);

  const filters = useMemo(
    () => ({
      page,
      page_size: pageSize,
      q: search || undefined,
      status: status || undefined,
      year: year ? Number(year) : undefined,
      sort_by: sortBy,
      order,
    }),
    [page, pageSize, search, status, year, sortBy, order],
  );

  const { data: projectData } = useQuery({
    queryKey: queryKeys.projects.detail(pid),
    queryFn: () => projectApi.get(pid),
    enabled: !!pid,
  });

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.papers.list(pid, filters),
    queryFn: () => paperApi.list(pid, filters),
    enabled: !!pid,
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      const hasProcessing = items.some((p: Paper) =>
        PROCESSING_STATUSES.includes(p.status),
      );
      return hasProcessing ? 3000 : false;
    },
  });

  const deleteMutation = useToastMutation({
    mutationFn: (paperId: number) => paperApi.delete(pid, paperId),
    successMessage: t('common.deleteSuccess'),
    errorMessage: t('common.deleteFailed'),
    invalidateKeys: [['papers', pid], queryKeys.projects.detail(pid)],
  });

  const batchDeleteMutation = useToastMutation({
    mutationFn: (paperIds: number[]) => paperApi.batchDelete(pid, paperIds),
    successMessage: t('common.deleteSuccess'),
    errorMessage: t('common.deleteFailed'),
    invalidateKeys: [['papers', pid], queryKeys.projects.detail(pid)],
  });

  const papers: Paper[] = useMemo(() => data?.items ?? [], [data?.items]);
  const total = data?.total ?? 0;

  const statusCounts = useMemo(() => {
    const counts = { processing: 0, indexed: 0, error: 0, total: papers.length };
    for (const p of papers) {
      if (PROCESSING_STATUSES.includes(p.status)) counts.processing++;
      else if (p.status === 'indexed') counts.indexed++;
      else if (p.status === 'error') counts.error++;
    }
    return counts;
  }, [papers]);

  const handleProcessAll = async () => {
    try {
      const result = await paperProcessApi.process(pid);
      if (result.queued > 0) {
        toast.success(t('papers.processQueued', { count: result.queued }));
        queryClient.invalidateQueries({ queryKey: queryKeys.papers.list(pid) });
      } else {
        toast.info(t('papers.noPapersToProcess'));
      }
    } catch {
      toast.error(t('papers.processFailed'));
    }
  };

  const handleRetry = async (paperId: number) => {
    try {
      const result = await paperProcessApi.process(pid, [paperId]);
      if (result.queued > 0) {
        toast.success(t('papers.retryQueued'));
        queryClient.invalidateQueries({ queryKey: queryKeys.papers.list(pid) });
      }
    } catch {
      toast.error(t('papers.processFailed'));
    }
  };

  const handleBatchDelete = () => {
    const ids = Array.from(selectedRows).map(Number);
    if (ids.length === 0) return;
    batchDeleteMutation.mutate(ids, {
      onSuccess: () => setSelectedRows(new Set()),
    });
  };

  const handleAddComplete = (uploadResult?: UploadResult) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.papers.list(pid) });
    if (uploadResult?.conflicts?.length) {
      setConflicts(uploadResult.conflicts);
    }
  };

  const handleResolveConflict = async (conflictId: string, action: string) => {
    try {
      const mappedAction = action === 'keep_existing' ? 'keep_old' : action === 'keep_new' ? 'keep_new' : action;
      if (mappedAction === 'ai_resolve') {
        const suggestions = await kbApi.autoResolve(pid, [conflictId]);
        if (Array.isArray(suggestions) && suggestions.length > 0) {
          await kbApi.resolveConflict(pid, conflictId, suggestions[0].action ?? 'skip');
        }
        setConflicts((prev) => prev.filter((c) => c.conflict_id !== conflictId));
        queryClient.invalidateQueries({ queryKey: queryKeys.papers.list(pid) });
        return;
      }
      await kbApi.resolveConflict(pid, conflictId, mappedAction);
      setConflicts((prev) => prev.filter((c) => c.conflict_id !== conflictId));
      queryClient.invalidateQueries({ queryKey: queryKeys.papers.list(pid) });
    } catch (err) {
      console.error('Failed to resolve conflict:', err);
    }
  };

  const handleAutoResolveAll = async () => {
    const ids = conflicts.map((c) => c.conflict_id);
    try {
      const suggestions = await kbApi.autoResolve(pid, ids);
      if (Array.isArray(suggestions)) {
        for (const s of suggestions) {
          if (s.action && !s.error) {
            await kbApi.resolveConflict(pid, s.conflict_id, s.action);
          }
        }
      }
      setConflicts([]);
      queryClient.invalidateQueries({ queryKey: queryKeys.papers.list(pid) });
    } catch (err) {
      console.error('Failed to auto-resolve:', err);
    }
  };

  const needsProcessing = statusCounts.processing > 0 || statusCounts.error > 0;

  const columns = usePapersColumns({
    pid,
    deleteMutation,
    handleRetry,
    setGraphPaperId,
  });

  const subtitle = projectData && (
    <span className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm text-muted-foreground">
      <span>{t('project.domain')}: {projectData.domain || '—'}</span>
      <span>{t('project.keywords')}: {projectData.keyword_count ?? 0}</span>
      <span>{t('project.created')}: {new Date(projectData.created_at).toLocaleDateString(i18n.language === 'zh' ? 'zh-CN' : 'en-US')}</span>
    </span>
  );

  const pageAction = (
    <PapersToolbar
      selectedRows={selectedRows}
      needsProcessing={needsProcessing}
      isBatchDeleting={batchDeleteMutation.isPending}
      onBatchDelete={handleBatchDelete}
      onProcessAll={handleProcessAll}
      onAddPaper={() => setShowAddPaper(true)}
      projectId={pid}
      paperFilters={{
        q: search || undefined,
        status: status || undefined,
        year: year ? Number(year) : undefined,
      }}
      paperCount={total}
    />
  );

  return (
    <PageLayout
      title={t('papers.title')}
      subtitle={subtitle}
      action={pageAction}
    >
      <div className="space-y-4">
        {statusCounts.processing > 0 && (
          <PaperStatusBanner
            processing={statusCounts.processing}
            indexed={statusCounts.indexed}
            total={statusCounts.total}
          />
        )}

        {conflicts.length > 0 && (
          <DedupConflictPanel
            projectId={pid}
            conflicts={conflicts}
            onResolve={handleResolveConflict}
            onAutoResolveAll={handleAutoResolveAll}
          />
        )}

        <PapersFilterBar
          search={search}
          status={status}
          year={year}
          sortBy={sortBy}
          order={order}
          onSearchChange={setSearch}
          onStatusChange={setStatus}
          onYearChange={setYear}
          onSortChange={setSortBy}
          onOrderChange={() => setOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
        />

        {isLoading ? (
          <LoadingState message={t('common.loading')} />
        ) : papers.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={t('papers.empty')}
            description={t('papers.emptyHint')}
            action={{ label: t('papers.addPaper'), onClick: () => setShowAddPaper(true) }}
          />
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <DataTable<Paper>
              columns={columns}
              data={papers}
              getRowId={(row) => row.id}
              isLoading={false}
              pagination={{ page, pageSize, total }}
              onPaginationChange={(p, ps) => {
                setPage(p);
                setPageSize(ps);
              }}
              sortBy={sortBy}
              sortOrder={order}
              onSort={(col) => {
                if (col === sortBy) setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
                else setSortBy(col);
              }}
              selectedRows={selectedRows}
              onSelectionChange={setSelectedRows}
              emptyMessage={t('papers.empty')}
              expandedRowId={expandedId}
              onExpandChange={setExpandedId}
              expandableRowRender={(paper) => (
                <div className="space-y-2 text-sm">
                  {paper.abstract && (
                    <div>
                      <span className="font-medium text-muted-foreground">
                        {t('papers.abstract')}
                      </span>{' '}
                      <span className="text-foreground">{paper.abstract}</span>
                    </div>
                  )}
                  {paper.authors && paper.authors.length > 0 && (
                    <div>
                      <span className="font-medium text-muted-foreground">
                        {t('papers.authors')}
                      </span>{' '}
                      <span className="text-foreground">
                        {paper.authors
                          .map((a) => (typeof a === 'object' && 'name' in a ? a.name : String(a)))
                          .join(', ')}
                      </span>
                    </div>
                  )}
                  {paper.doi && (
                    <div>
                      <span className="font-medium text-muted-foreground">DOI</span>{' '}
                      <a
                        href={`https://doi.org/${paper.doi}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        {paper.doi}
                      </a>
                    </div>
                  )}
                </div>
              )}
            />
            <div className="flex items-center justify-between border-t border-border px-4 py-2 text-sm text-muted-foreground">
              <span>{t('papers.total', { count: total })}</span>
              {total > 0 && (
                <span className="flex gap-3">
                  <span className="text-green-600 dark:text-green-400">
                    {statusCounts.indexed} {t('papers.statuses.indexed')}
                  </span>
                  {statusCounts.processing > 0 && (
                    <span className="text-blue-600 dark:text-blue-400">
                      {statusCounts.processing} {t('papers.processing')}
                    </span>
                  )}
                  {statusCounts.error > 0 && (
                    <span className="text-red-600 dark:text-red-400">
                      {statusCounts.error} {t('papers.statuses.error')}
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>
        )}

        {graphPaperId !== null && (
          <CitationGraphDialog
            projectId={pid}
            paperId={graphPaperId}
            onClose={() => setGraphPaperId(null)}
          />
        )}

        <AddPaperDialog
          projectId={pid}
          open={showAddPaper}
          onOpenChange={setShowAddPaper}
          onComplete={handleAddComplete}
        />
      </div>
    </PageLayout>
  );
}
