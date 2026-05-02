import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { FileText, FileSpreadsheet, Library, ExternalLink, Loader2, CheckCircle2, Copy } from 'lucide-react';
import { paperApi } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';
import { useToastMutation } from '@/hooks/use-toast-mutation';
import { LoadingState } from '@/components/ui/loading-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import PageLayout from '@/components/layout/PageLayout';

export default function ExportPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId!);

  const { data: papersData, isLoading } = useQuery({
    queryKey: queryKeys.papers.list(pid),
    queryFn: () => paperApi.list(pid),
  });

  const papers = papersData?.items ?? [];

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportBibtexMutation = useToastMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/v1/projects/${pid}/export/bibtex`, { method: 'POST' });
      const blob = await response.blob();
      downloadBlob(blob, 'references.bib');
      return { success: true };
    },
    successMessage: t('export.downloaded', { format: 'BibTeX' }),
    errorMessage: t('export.failed', { format: 'BibTeX' }),
  });

  const exportRisMutation = useToastMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/v1/projects/${pid}/export/ris`, { method: 'POST' });
      const blob = await response.blob();
      downloadBlob(blob, 'references.ris');
      return { success: true };
    },
    successMessage: t('export.downloaded', { format: 'RIS' }),
    errorMessage: t('export.failed', { format: 'RIS' }),
  });

  const exportCsvMutation = useToastMutation({
    mutationFn: async () => {
      const headers = ['Title', 'Authors', 'Year', 'Journal', 'DOI', 'Abstract'];
      const rows = papers.map((p) => [
        `"${(p.title || '').replace(/"/g, '""')}"`,
        `"${formatAuthors(p.authors).replace(/"/g, '""')}"`,
        p.year || '',
        `"${(p.journal || '').replace(/"/g, '""')}"`,
        p.doi || '',
        `"${(p.abstract || '').replace(/"/g, '""')}"`,
      ]);
      const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      downloadBlob(new Blob([csv], { type: 'text/csv' }), 'references.csv');
      return { success: true };
    },
    successMessage: t('export.downloaded', { format: 'CSV' }),
    errorMessage: t('export.failed', { format: 'CSV' }),
  });

  const exportZoteroMutation = useToastMutation({
    mutationFn: () =>
      fetch(`/api/v1/projects/${pid}/export/zotero`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection_name: 'Omelette Export' }),
      }).then((r) => r.json()),
    successMessage: t('export.zoteroCreated'),
    errorMessage: t('export.failed', { format: 'Zotero' }),
  });

  if (isLoading) {
    return (
      <PageLayout title={t('export.title')}>
        <LoadingState />
      </PageLayout>
    );
  }

  return (
    <PageLayout title={t('export.title')} subtitle={t('export.subtitle', { count: papers.length })}>
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ExportCard
            icon={FileText}
            title={t('export.bibtex')}
            description={t('export.bibtexDesc')}
            color="text-blue-500"
            onClick={() => exportBibtexMutation.mutate()}
            isPending={exportBibtexMutation.isPending}
            isPendingLabel={t('export.exporting')}
          />
          <ExportCard
            icon={FileSpreadsheet}
            title={t('export.csv')}
            description={t('export.csvDesc')}
            color="text-green-500"
            onClick={() => exportCsvMutation.mutate()}
            isPending={exportCsvMutation.isPending}
            isPendingLabel={t('export.exporting')}
          />
          <ExportCard
            icon={Library}
            title={t('export.ris')}
            description={t('export.risDesc')}
            color="text-purple-500"
            onClick={() => exportRisMutation.mutate()}
            isPending={exportRisMutation.isPending}
            isPendingLabel={t('export.exporting')}
          />
          <ExportCard
            icon={ExternalLink}
            title={t('export.zotero')}
            description={t('export.zoteroDesc')}
            color="text-amber-500"
            onClick={() => exportZoteroMutation.mutate()}
            isPending={exportZoteroMutation.isPending}
            isPendingLabel={t('export.exporting')}
          />
        </div>

        {exportZoteroMutation.isSuccess && exportZoteroMutation.data?.data?.preview && (
          <div className="rounded-lg border bg-card p-4">
            <div className="mb-2 flex items-center gap-2">
              <CheckCircle2 className="size-4 text-green-500" />
              <span className="text-sm font-medium">{t('export.zoteroPreview')}</span>
              <Badge variant="outline" className="ml-auto">
                {exportZoteroMutation.data.data.paper_count} papers
              </Badge>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              {exportZoteroMutation.data.data.message}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(exportZoteroMutation.data.data.preview);
              }}
            >
              <Copy className="mr-1 size-3" />
              {t('export.copyBibtex')}
            </Button>
          </div>
        )}

        {exportZoteroMutation.isSuccess && exportZoteroMutation.data?.data?.collection_key && (
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-green-500">
              <CheckCircle2 className="size-4" />
              <span className="text-sm font-medium">
                {t('export.zoteroCreated')}: {exportZoteroMutation.data.data.collection_name}
              </span>
              <Badge variant="secondary" className="ml-auto">
                {exportZoteroMutation.data.data.items_created} items
              </Badge>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}

function ExportCard({
  icon: Icon,
  title,
  description,
  color,
  onClick,
  isPending,
  isPendingLabel,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  color: string;
  onClick: () => void;
  isPending: boolean;
  isPendingLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      className="flex flex-col items-start gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-accent disabled:opacity-50"
    >
      <Icon className={`size-6 ${color}`} />
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      {isPending && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          {isPendingLabel}
        </div>
      )}
    </button>
  );
}

function formatAuthors(authors: unknown): string {
  if (!authors) return '';
  if (Array.isArray(authors)) {
    return authors
      .map((a) => (typeof a === 'string' ? a : a?.name || String(a)))
      .join(', ');
  }
  return String(authors);
}
