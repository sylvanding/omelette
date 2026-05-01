import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Loader2, Sparkles, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { paperApi } from '@/services/api';
import { useToastMutation } from '@/hooks/use-toast-mutation';
import type { PaperComparisonResponse, PaperComparisonDimension } from '@/types/api';
import { cn } from '@/lib/utils';

interface PaperComparisonDialogProps {
  projectId: number;
  paperIds: number[];
  onClose: () => void;
}

const DIMENSION_LABELS: Record<string, string> = {
  research_question: 'Research Question',
  method: 'Method',
  dataset: 'Dataset',
  key_results: 'Key Results',
  limitations: 'Limitations',
  year: 'Year',
  citation_count: 'Citation Count',
};

export function PaperComparisonDialog({
  projectId,
  paperIds,
  onClose,
}: PaperComparisonDialogProps) {
  const { t } = useTranslation();
  const [focus, setFocus] = useState('');

  const compare = useToastMutation<PaperComparisonResponse, string | undefined>({
    mutationFn: (f?: string) =>
      paperApi.compare(projectId, { paper_ids: paperIds, focus: f || undefined }),
    successMessage: false,
    errorMessage: 'Failed to generate comparison',
  });

  const handleCompare = () => compare.mutate(focus || undefined);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative flex h-[90vh] w-[95vw] max-w-7xl flex-col rounded-xl border border-border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            <h2 className="text-lg font-semibold">{t('papers.compareTitle')}</h2>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close">
            <X className="size-5" />
          </Button>
        </div>

        {/* Focus input */}
        <div className="flex gap-2 border-b border-border px-6 py-3">
          <input
            type="text"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            placeholder="Optional: focus the comparison (e.g., 'Compare methods only')"
            className="flex-1 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm outline-none focus:border-primary"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !compare.isPending) handleCompare();
            }}
          />
          {compare.isError && !compare.data ? (
            <Button onClick={handleCompare} disabled={compare.isPending} variant="destructive">
              <RotateCcw className="mr-1.5 size-4" />
              Retry
            </Button>
          ) : (
            <Button onClick={handleCompare} disabled={compare.isPending}>
              {compare.isPending ? (
                <>
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                  Analyzing...
                </>
              ) : compare.data ? (
                <>
                  <RotateCcw className="mr-1.5 size-4" />
                  Regenerate
                </>
              ) : (
                <>
                  <Sparkles className="mr-1.5 size-4" />
                  Compare
                </>
              )}
            </Button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {compare.isPending && !compare.data && (
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="size-10 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Analyzing papers with AI...</p>
              </div>
            </div>
          )}


          {compare.data && <ComparisonView data={compare.data} />}
        </div>
      </div>
    </div>
  );
}

interface ComparisonViewProps {
  data: PaperComparisonResponse;
}

function ComparisonView({ data }: ComparisonViewProps) {
  const { papers, dimensions, summary } = data;

  return (
    <div className="space-y-6">
      {/* Paper headers */}
      <div className="grid gap-4" style={{ gridTemplateColumns: `200px repeat(${papers.length}, 1fr)` }}>
        <div className="flex items-end pb-2 text-sm font-medium text-muted-foreground">
          Paper
        </div>
        {papers.map((paper) => (
          <div key={paper.id} className="rounded-lg bg-muted/50 p-3">
            <p className="font-semibold text-sm leading-tight">{paper.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {paper.authors?.slice(0, 2).map((a) => a.name).join(', ')}
              {(paper.authors?.length ?? 0) > 2 ? ' et al.' : ''}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {paper.journal}{paper.year ? ` (${paper.year})` : ''} · {paper.citation_count} citations
            </p>
          </div>
        ))}
      </div>

      {/* Comparison table */}
      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="w-[200px] px-4 py-3 text-left font-medium text-muted-foreground">
                Dimension
              </th>
              {papers.map((paper) => (
                <th key={paper.id} className="px-4 py-3 text-left font-medium text-muted-foreground">
                  {paper.title.slice(0, 30)}{paper.title.length > 30 ? '...' : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dimensions.map((dim, idx) => (
              <ComparisonRow key={dim.dimension} dimension={dim} papers={papers} isAlt={idx % 2 === 1} />
            ))}
          </tbody>
        </table>
      </div>

      {/* AI Summary */}
      {summary && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h3 className="font-semibold text-sm">AI Summary</h3>
          </div>
          <p className="text-sm leading-relaxed text-foreground/80">{summary}</p>
        </div>
      )}
    </div>
  );
}

interface ComparisonRowProps {
  dimension: PaperComparisonDimension;
  papers: PaperComparisonResponse['papers'];
  isAlt: boolean;
}

function ComparisonRow({ dimension, papers, isAlt }: ComparisonRowProps) {
  const label = DIMENSION_LABELS[dimension.dimension] ?? dimension.dimension;

  return (
    <tr className={cn('border-b', isAlt && 'bg-muted/20')}>
      <td className="px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
        {label}
      </td>
      {papers.map((paper) => {
        const cell = dimension.cells.find((c) => c.paper_id === paper.id);
        return (
          <td key={paper.id} className="px-4 py-3 text-sm leading-relaxed">
            {cell?.content ?? '—'}
          </td>
        );
      })}
    </tr>
  );
}
