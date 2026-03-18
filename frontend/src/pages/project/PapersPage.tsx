import { lazy, Suspense, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToastMutation } from '@/hooks/use-toast-mutation';
import { toast } from 'sonner';
import {
  Search,
  Trash2,
  FileDown,
  Plus,
  FileText,
  RefreshCw,
  Loader2,
  Zap,
  GitBranch,
  X,
  BookOpenText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import type { DataTableColumn } from '@/components/ui/data-table';
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

const CitationGraphView = lazy(() => import('@/components/citation-graph/CitationGraphView'));
import type { GraphData } from '@/components/citation-graph/CitationGraphView';

const PROCESSING_STATUSES: PaperStatus[] = ['pdf_downloaded', 'ocr_complete'];

export default function PapersPage() {
  const { t, i18n } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();

  const STATUS_OPTIONS: { value: PaperStatus | ''; label: string }[] = [
    { value: '', label: t('papers.statuses.all') },
    { value: 'pending', label: t('papers.statuses.pending') },
    { value: 'metadata_only', label: t('papers.statuses.metadata_only') },
    { value: 'pdf_downloaded', label: t('papers.statuses.pdf_downloaded') },
    { value: 'ocr_complete', label: t('papers.statuses.ocr_complete') },
    { value: 'indexed', label: t('papers.statuses.indexed') },
    { value: 'error', label: t('papers.statuses.error') },
  ];

  const SORT_OPTIONS = [
    { value: 'created_at', label: t('papers.sortBy.created_at') },
    { value: 'year', label: t('papers.sortBy.year') },
    { value: 'citation_count', label: t('papers.sortBy.citation_count') },
    { value: 'title', label: t('papers.sortBy.title') },
  ];

  const queryClient = useQueryClient();
  const navigate = useNavigate();
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

  const papers: Paper[] = data?.items ?? [];
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

  const getStatusBadgeVariant = (status: PaperStatus): 'success' | 'info' | 'destructive' | 'warning' => {
    if (status === 'indexed') return 'success';
    if (PROCESSING_STATUSES.includes(status)) return 'info';
    if (status === 'error') return 'destructive';
    return 'warning';
  };

  const columns: DataTableColumn<Paper>[] = [
    {
      id: 'title',
      header: t('common.title'),
      accessorKey: 'title',
      sortable: true,
      cell: ({ row }) => (
        <span className="line-clamp-2 font-medium text-foreground">{row.title}</span>
      ),
    },
    {
      id: 'journal',
      header: t('papers.journal'),
      accessorKey: 'journal',
      cell: ({ value }) => (value != null ? String(value) : '—'),
    },
    {
      id: 'year',
      header: t('common.year'),
      accessorKey: 'year',
      sortable: true,
      cell: ({ value }) => (value != null ? String(value) : '—'),
    },
    {
      id: 'citation_count',
      header: t('papers.citations'),
      accessorKey: 'citation_count',
      sortable: true,
    },
    {
      id: 'status',
      header: t('common.status'),
      accessorKey: 'status',
      cell: ({ row }) => (
        <Badge variant={getStatusBadgeVariant(row.status)} className="gap-1">
          {PROCESSING_STATUSES.includes(row.status) && (
            <Loader2 className="size-3 animate-spin" />
          )}
          {t(`papers.statuses.${row.status}`, row.status)}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: t('common.actions'),
      accessorFn: () => null,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => navigate(`/projects/${pid}/papers/${row.id}/read`)}
            className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            title={t('papers.readPdf', 'Read PDF')}
          >
            <BookOpenText className="size-4" />
          </button>
          <button
            onClick={() => setGraphPaperId(row.id)}
            className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            title={t('papers.citationGraph.title', 'Citation graph')}
          >
            <GitBranch className="size-4" />
          </button>
          {row.pdf_url && (
            <a
              href={row.pdf_url}
              target="_blank"
              rel="noreferrer"
              className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              title={t('papers.downloadPdf')}
            >
              <FileDown className="size-4" />
            </a>
          )}
          {row.status === 'error' && (
            <button
              onClick={() => handleRetry(row.id)}
              className="rounded p-1.5 text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-400"
              title={t('papers.retry')}
            >
              <RefreshCw className="size-4" />
            </button>
          )}
          <ConfirmDialog
            trigger={
              <button
                disabled={deleteMutation.isPending}
                className="rounded p-1.5 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
                title={t('common.delete')}
              >
                <Trash2 className="size-4" />
              </button>
            }
            title={t('common.confirmDeleteTitle')}
            description={t('papers.confirmDelete')}
            confirmText={t('common.delete')}
            cancelText={t('common.cancel')}
            onConfirm={() => deleteMutation.mutate(row.id)}
            destructive
          />
        </div>
      ),
    },
  ];

  const subtitle = projectData && (
    <span className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm text-muted-foreground">
      <span>{t('project.domain')}: {projectData.domain || '—'}</span>
      <span>{t('project.keywords')}: {projectData.keyword_count ?? 0}</span>
      <span>{t('project.created')}: {new Date(projectData.created_at).toLocaleDateString(i18n.language === 'zh' ? 'zh-CN' : 'en-US')}</span>
    </span>
  );

  const pageAction = (
    <div className="flex gap-2">
      {selectedRows.size > 0 && (
        <ConfirmDialog
          trigger={
            <Button
              variant="destructive"
              disabled={batchDeleteMutation.isPending}
              className="gap-1.5"
            >
              <Trash2 className="size-4" />
              {t('common.delete')} ({selectedRows.size})
            </Button>
          }
          title={t('common.confirmDeleteTitle')}
          description={t('common.confirmDeleteDesc')}
          confirmText={t('common.delete')}
          cancelText={t('common.cancel')}
          onConfirm={handleBatchDelete}
          destructive
        />
      )}
      {needsProcessing && (
        <Button variant="outline" onClick={handleProcessAll} className="gap-1.5">
          <Zap className="size-4" />
          {t('papers.processAll')}
        </Button>
      )}
      <Button onClick={() => setShowAddPaper(true)} className="gap-1.5">
        <Plus className="size-4" />
        {t('papers.addPaper')}
      </Button>
    </div>
  );

  return (
    <PageLayout
      title={t('papers.title')}
      subtitle={subtitle}
      action={pageAction}
    >
      <div className="space-y-4">
        {/* Processing progress banner */}
        {statusCounts.processing > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-blue-500/30 bg-blue-500/5 px-4 py-3">
            <Loader2 className="size-4 animate-spin text-blue-600 dark:text-blue-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                {t('papers.processingBanner', {
                  processing: statusCounts.processing,
                  indexed: statusCounts.indexed,
                  total: statusCounts.total,
                })}
              </p>
            </div>
          </div>
        )}

        {conflicts.length > 0 && (
          <DedupConflictPanel
            projectId={pid}
            conflicts={conflicts}
            onResolve={handleResolveConflict}
            onAutoResolveAll={handleAutoResolveAll}
          />
        )}

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t('papers.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={status || '__all__'}
              onValueChange={(v) => setStatus(v === '__all__' ? '' : (v as PaperStatus))}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder={t('papers.statuses.all')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t('papers.statuses.all')}</SelectItem>
                {STATUS_OPTIONS.filter((o) => o.value).map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              placeholder={t('common.year')}
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="w-24"
            />
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
            >
              {order === 'asc' ? t('common.asc') : t('common.desc')}
            </Button>
          </div>
        </div>

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

function CitationGraphDialog({
  projectId,
  paperId,
  onClose,
}: {
  projectId: number;
  paperId: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  const { data, isLoading } = useQuery<GraphData>({
    queryKey: queryKeys.papers.citationGraph(projectId, paperId),
    queryFn: () =>
      paperApi.getCitationGraph(projectId, paperId).then((r) => r as unknown as GraphData),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative h-[80vh] w-[90vw] max-w-6xl rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-lg font-semibold">
            {t('papers.citationGraph.title', 'Citation graph')}
          </h2>
          <Button size="icon" variant="ghost" onClick={onClose}>
            <X className="size-5" />
          </Button>
        </div>
        <div className="h-[calc(100%-56px)]">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <CitationGraphView
              data={data ?? { nodes: [], edges: [], center_id: null }}
              isLoading={isLoading}
              projectId={projectId}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
