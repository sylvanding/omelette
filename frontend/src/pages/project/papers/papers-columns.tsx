import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileDown, RefreshCw, Loader2, GitBranch, Trash2, BookOpenText, Copy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { StarRating } from '@/components/ui/star-rating';
import { ImpactScoreBadge } from '@/components/impact-score/ImpactScoreBadge';
import type { DataTableColumn } from '@/components/ui/data-table';
import type { Paper, PaperStatus, ReadingStatus } from '@/types';
import type { ImpactFactor } from '@/services/api';

const PROCESSING_STATUSES: PaperStatus[] = ['pdf_downloaded', 'ocr_complete'];

interface UsePapersColumnsParams {
  pid: number;
  deleteMutation: { isPending: boolean; mutate: (id: number) => void };
  handleRetry: (paperId: number) => void;
  setGraphPaperId: (id: number) => void;
  onRatingChange?: (paperId: number, rating: number) => void;
  impactScores?: Map<number, { score: number; factors: Record<string, ImpactFactor> }>;
  onCopyCitation?: (paperId: number) => void;
}

export function usePapersColumns({
  pid,
  deleteMutation,
  handleRetry,
  setGraphPaperId,
  onRatingChange,
  impactScores,
  onCopyCitation,
}: UsePapersColumnsParams): DataTableColumn<Paper>[] {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const getStatusBadgeVariant = (status: PaperStatus): 'success' | 'info' | 'destructive' | 'warning' => {
    if (status === 'indexed') return 'success';
    if (PROCESSING_STATUSES.includes(status)) return 'info';
    if (status === 'error') return 'destructive';
    return 'warning';
  };

  const getReadingStatusColor = (status: ReadingStatus): string => {
    if (status === 'read') return 'text-green-600 bg-green-500/10';
    if (status === 'reading') return 'text-blue-600 bg-blue-500/10';
    if (status === 'archived') return 'text-gray-600 bg-gray-500/10';
    return 'text-slate-500 bg-slate-500/10';
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
      cell: ({ value }) => (value != null ? Number(value).toLocaleString() : '—'),
    },
    {
      id: 'impact_score',
      header: t('papers.impactScore', 'Impact'),
      sortable: true,
      accessorFn: (row) => {
        const entry = impactScores?.get(row.id);
        return entry?.score ?? 0;
      },
      cell: ({ row }) => {
        const entry = impactScores?.get(row.id);
        if (!entry) return <span className="text-muted-foreground">—</span>;
        return (
          <ImpactScoreBadge score={entry.score} factors={entry.factors} />
        );
      },
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
      id: 'reading_status',
      header: t('papers.readingStatus', 'Reading Status'),
      accessorKey: 'reading_status',
      cell: ({ row }) => (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getReadingStatusColor(row.reading_status)}`}>
          {t(`papers.readingStatuses.${row.reading_status}`, row.reading_status)}
        </span>
      ),
    },
    {
      id: 'rating',
      header: t('papers.rating', 'Rating'),
      accessorKey: 'rating',
      sortable: true,
      cell: ({ row }) => (
        <StarRating
          value={row.rating ?? 0}
          onChange={(rating) => onRatingChange?.(row.id, rating)}
          size={14}
        />
      ),
    },
    {
      id: 'quality_tags',
      header: t('papers.qualityTags', 'Quality Tags'),
      accessorKey: 'quality_tags',
      cell: ({ row }) => {
        const tags = row.quality_tags;
        if (!tags || tags.length === 0) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => (
              <Badge key={tag} variant="info" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: t('common.actions'),
      accessorFn: () => null,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {onCopyCitation && (
            <button
              onClick={() => onCopyCitation(row.id)}
              className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              title="Copy citation"
              aria-label="Copy citation"
            >
              <Copy className="size-4" />
            </button>
          )}
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
