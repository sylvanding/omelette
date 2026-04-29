import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileDown, RefreshCw, Loader2, GitBranch, Trash2, BookOpenText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { DataTableColumn } from '@/components/ui/data-table';
import type { Paper, PaperStatus } from '@/types';

const PROCESSING_STATUSES: PaperStatus[] = ['pdf_downloaded', 'ocr_complete'];

interface UsePapersColumnsParams {
  pid: number;
  deleteMutation: { isPending: boolean; mutate: (id: number) => void };
  handleRetry: (paperId: number) => void;
  setGraphPaperId: (id: number) => void;
}

export function usePapersColumns({
  pid,
  deleteMutation,
  handleRetry,
  setGraphPaperId,
}: UsePapersColumnsParams): DataTableColumn<Paper>[] {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const getStatusBadgeVariant = (status: PaperStatus): 'success' | 'info' | 'destructive' | 'warning' => {
    if (status === 'indexed') return 'success';
    if (PROCESSING_STATUSES.includes(status)) return 'info';
    if (status === 'error') return 'destructive';
    return 'warning';
  };

  return [
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
            aria-label={t('papers.readPdf', 'Read PDF')}
          >
            <BookOpenText className="size-4" />
          </button>
          <button
            onClick={() => setGraphPaperId(row.id)}
            className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            title={t('papers.citationGraph.title', 'Citation graph')}
            aria-label={t('papers.citationGraph.title', 'Citation graph')}
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
              aria-label={t('papers.downloadPdf')}
            >
              <FileDown className="size-4" />
            </a>
          )}
          {row.status === 'error' && (
            <button
              onClick={() => handleRetry(row.id)}
              className="rounded p-1.5 text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-400"
              title={t('papers.retry')}
              aria-label={t('papers.retry')}
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
                aria-label={t('common.delete')}
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
}
