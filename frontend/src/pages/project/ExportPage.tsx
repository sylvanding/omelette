import { useParams } from 'react-router-dom';
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
    successMessage: 'BibTeX file downloaded',
    errorMessage: 'Failed to export BibTeX',
  });

  const exportRisMutation = useToastMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/v1/projects/${pid}/export/ris`, { method: 'POST' });
      const blob = await response.blob();
      downloadBlob(blob, 'references.ris');
      return { success: true };
    },
    successMessage: 'RIS file downloaded',
    errorMessage: 'Failed to export RIS',
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
    successMessage: 'CSV file downloaded',
    errorMessage: 'Failed to export CSV',
  });

  const exportZoteroMutation = useToastMutation({
    mutationFn: () =>
      fetch(`/api/v1/projects/${pid}/export/zotero`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection_name: 'Omelette Export' }),
      }).then((r) => r.json()),
    successMessage: 'Exported to Zotero',
    errorMessage: 'Failed to export to Zotero',
  });

  if (isLoading) {
    return (
      <PageLayout title="Export References">
        <LoadingState />
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Export References" subtitle={`${papers.length} papers in your library`}>
      <div className="space-y-6">
        {/* Summary */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ExportCard
            icon={FileText}
            title="BibTeX"
            description="LaTeX bibliography format"
            color="text-blue-500"
            onClick={() => exportBibtexMutation.mutate()}
            isPending={exportBibtexMutation.isPending}
          />
          <ExportCard
            icon={FileSpreadsheet}
            title="CSV"
            description="Spreadsheet format"
            color="text-green-500"
            onClick={() => exportCsvMutation.mutate()}
            isPending={exportCsvMutation.isPending}
          />
          <ExportCard
            icon={Library}
            title="RIS"
            description="Reference manager format (EndNote, Mendeley)"
            color="text-purple-500"
            onClick={() => exportRisMutation.mutate()}
            isPending={exportRisMutation.isPending}
          />
          <ExportCard
            icon={ExternalLink}
            title="Zotero"
            description="Export to Zotero library"
            color="text-amber-500"
            onClick={() => exportZoteroMutation.mutate()}
            isPending={exportZoteroMutation.isPending}
          />
        </div>

        {/* Zotero result */}
        {exportZoteroMutation.isSuccess && exportZoteroMutation.data?.data?.preview && (
          <div className="rounded-lg border bg-card p-4">
            <div className="mb-2 flex items-center gap-2">
              <CheckCircle2 className="size-4 text-green-500" />
              <span className="text-sm font-medium">Zotero BibTeX Preview</span>
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
              Copy BibTeX
            </Button>
          </div>
        )}

        {exportZoteroMutation.isSuccess && exportZoteroMutation.data?.data?.collection_key && (
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-green-500">
              <CheckCircle2 className="size-4" />
              <span className="text-sm font-medium">
                Zotero collection created: {exportZoteroMutation.data.data.collection_name}
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
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  color: string;
  onClick: () => void;
  isPending: boolean;
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
          Exporting...
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
