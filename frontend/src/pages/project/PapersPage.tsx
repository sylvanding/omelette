import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToastMutation } from '@/hooks/use-toast-mutation';
import {
  Search,
  ChevronDown,
  ChevronRight,
  Trash2,
  FileDown,
  Scan,
  Plus,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { paperApi, ocrApi } from '@/services/api';
import { kbApi } from '@/services/kb-api';
import type { Paper, PaperStatus } from '@/types';
import type { UploadResult, DedupConflictPair } from '@/services/kb-api';
import { cn } from '@/lib/utils';
import { AddPaperDialog } from '@/components/knowledge-base/AddPaperDialog';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import { DedupConflictPanel } from '@/components/knowledge-base/DedupConflictPanel';

export default function PapersPage() {
  const { t } = useTranslation();
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
  const pid = Number(projectId!);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<PaperStatus | ''>('');
  const [year, setYear] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showAddPaper, setShowAddPaper] = useState(false);
  const [conflicts, setConflicts] = useState<DedupConflictPair[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['papers', pid, search, status, year, sortBy, order],
    queryFn: () =>
      paperApi.list(pid, {
        q: search || undefined,
        status: status || undefined,
        year: year ? Number(year) : undefined,
        sort_by: sortBy,
        order,
      }),
    enabled: !!pid,
  });

  const deleteMutation = useToastMutation({
    mutationFn: (paperId: number) => paperApi.delete(pid, paperId),
    successMessage: t('common.deleteSuccess'),
    errorMessage: t('common.deleteFailed'),
    invalidateKeys: [['papers', pid], ['project', projectId]],
  });

  const ocrMutation = useToastMutation({
    mutationFn: (paperIds: number[]) => ocrApi.process(pid, paperIds),
    successMessage: t('papers.ocrSuccess'),
    errorMessage: t('papers.ocrFailed'),
    invalidateKeys: [['papers', pid], ['project', projectId]],
  });

  const papers: Paper[] = data?.items ?? [];
  const total = data?.total ?? 0;

  const handleAddComplete = (uploadResult?: UploadResult) => {
    queryClient.invalidateQueries({ queryKey: ['papers', pid] });
    if (uploadResult?.conflicts?.length) {
      setConflicts(uploadResult.conflicts);
    }
  };

  const handleResolveConflict = async (conflictId: string, action: string) => {
    try {
      await kbApi.resolveConflict(pid, conflictId, action === 'keep_existing' ? 'keep_old' : action);
      setConflicts((prev) => prev.filter((c) => c.conflict_id !== conflictId));
      queryClient.invalidateQueries({ queryKey: ['papers', pid] });
    } catch (err) {
      console.error('Failed to resolve conflict:', err);
    }
  };

  const handleAutoResolveAll = async () => {
    const ids = conflicts.map((c) => c.conflict_id);
    try {
      await kbApi.autoResolve(pid, ids);
      setConflicts([]);
      queryClient.invalidateQueries({ queryKey: ['papers', pid] });
    } catch (err) {
      console.error('Failed to auto-resolve:', err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-foreground">{t('papers.title')}</h1>
        <Button onClick={() => setShowAddPaper(true)} className="gap-1.5">
          <Plus className="size-4" />
          {t('papers.addPaper')}
        </Button>
      </div>

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
            <input
              type="text"
              placeholder={t('papers.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as PaperStatus | '')}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value || 'all'} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            placeholder={t('common.year')}
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => setOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
            className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm hover:bg-secondary/80"
          >
            {order === 'asc' ? t('common.asc') : t('common.desc')}
          </button>
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
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="w-8 px-4 py-3 text-left text-xs font-medium text-muted-foreground" />
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    {t('common.title')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    {t('papers.journal')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    {t('common.year')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    {t('papers.citations')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    {t('common.status')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                    {t('common.actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {papers.map((paper) => (
                  <React.Fragment key={paper.id}>
                    <tr
                      key={paper.id}
                      className="border-b border-border hover:bg-muted/30">
                      <td className="px-4 py-2">
                        <button
                          onClick={() =>
                            setExpandedId(expandedId === paper.id ? null : paper.id)
                          }
                          className="p-1 text-muted-foreground hover:text-foreground">
                          {expandedId === paper.id ? (
                            <ChevronDown className="size-4" />
                          ) : (
                            <ChevronRight className="size-4" />
                          )}
                        </button>
                      </td>
                      <td className="max-w-md px-4 py-2">
                        <span className="line-clamp-2 font-medium text-foreground">
                          {paper.title}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm text-muted-foreground">
                        {paper.journal || '-'}
                      </td>
                      <td className="px-4 py-2 text-sm text-muted-foreground">
                        {paper.year ?? '-'}
                      </td>
                      <td className="px-4 py-2 text-sm text-muted-foreground">
                        {paper.citation_count}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                            paper.status === 'indexed' && 'bg-green-500/10 text-green-700 dark:text-green-400',
                            paper.status === 'ocr_complete' && 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
                            paper.status === 'pdf_downloaded' && 'bg-violet-500/10 text-violet-700 dark:text-violet-400',
                            paper.status === 'error' && 'bg-red-500/10 text-red-700 dark:text-red-400',
                            paper.status === 'pending' && 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
                            paper.status === 'metadata_only' && 'bg-slate-500/10 text-slate-700 dark:text-slate-400',
                          )}>
                          {t(`papers.statuses.${paper.status}`, paper.status)}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          {paper.pdf_url && (
                            <a
                              href={paper.pdf_url}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                              title={t('papers.downloadPdf')}>
                              <FileDown className="size-4" />
                            </a>
                          )}
                          <button
                            onClick={() =>
                              ocrMutation.mutate([paper.id])}
                            disabled={ocrMutation.isPending || paper.status === 'ocr_complete'}
                            className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
                            title={t('papers.runOcr')}>
                            <Scan className="size-4" />
                          </button>
                          <ConfirmDialog
                            trigger={
                              <button
                                disabled={deleteMutation.isPending}
                                className="rounded p-1.5 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
                                title={t('common.delete')}>
                                <Trash2 className="size-4" />
                              </button>
                            }
                            title={t('common.confirmDeleteTitle')}
                            description={t('papers.confirmDelete')}
                            confirmText={t('common.delete')}
                            cancelText={t('common.cancel')}
                            onConfirm={() => deleteMutation.mutate(paper.id)}
                            destructive
                          />
                        </div>
                      </td>
                    </tr>
                    {expandedId === paper.id && (
                      <tr key={`${paper.id}-expanded`} className="bg-muted/20">
                        <td colSpan={7} className="px-4 py-4">
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
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border px-4 py-2 text-sm text-muted-foreground">
            {t('papers.total', { count: total })}
          </div>
        </div>
      )}

      <AddPaperDialog
        projectId={pid}
        open={showAddPaper}
        onOpenChange={setShowAddPaper}
        onComplete={handleAddComplete}
      />
    </div>
  );
}
