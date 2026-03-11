import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { NewPaperData } from '@/services/kb-api';

interface SearchResult extends NewPaperData {
  source_id?: string;
  pdf_url?: string;
}

interface SearchResultsStepProps {
  results: SearchResult[];
  selected: Set<number>;
  isSearching: boolean;
  onToggleSelect: (index: number) => void;
  onSelectAll: () => void;
}

export function SearchResultsStep({
  results,
  selected,
  isSearching,
  onToggleSelect,
  onSelectAll,
}: SearchResultsStepProps) {
  const { t } = useTranslation();

  if (isSearching) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        {t('kb.searchAdd.searching')}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <p className="font-medium">{t('kb.searchAdd.noResults')}</p>
        <p className="mt-1 text-sm">{t('kb.searchAdd.noResultsDesc')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 py-2">
      <div className="flex items-center justify-between">
        <Badge variant="secondary">
          {t('kb.searchAdd.resultsCount', { count: results.length })}
        </Badge>
        <button
          onClick={onSelectAll}
          className="text-sm text-primary hover:underline"
        >
          {selected.size === results.length
            ? t('kb.searchAdd.deselectAll')
            : t('kb.searchAdd.selectAll')}
        </button>
      </div>
      <div className="flex items-center text-xs text-muted-foreground">
        {selected.size > 0 && t('kb.searchAdd.addSelected', { count: selected.size })}
      </div>
      <ul className="max-h-72 space-y-2 overflow-y-auto rounded-md border border-border p-2">
        {results.map((paper, i) => (
          <label
            key={paper.source_id ?? paper.doi ?? `paper-${i}`}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
              selected.has(i)
                ? 'border-primary bg-primary/5'
                : 'border-border hover:bg-muted/30',
            )}
          >
            <input
              type="checkbox"
              checked={selected.has(i)}
              onChange={() => onToggleSelect(i)}
              className="mt-1 rounded border-border"
            />
            <div className="min-w-0 flex-1">
              <div className="font-medium leading-snug">{paper.title}</div>
              {paper.authors && paper.authors.length > 0 && (
                <div className="mt-0.5 text-sm text-muted-foreground">
                  {paper.authors.map((a) => a.name).join(', ')}
                </div>
              )}
              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                {paper.journal && <span>{paper.journal}</span>}
                {paper.year && <span>({paper.year})</span>}
                {paper.doi && (
                  <span className="truncate text-[10px] opacity-60">
                    {paper.doi}
                  </span>
                )}
              </div>
            </div>
          </label>
        ))}
      </ul>
    </div>
  );
}

export type { SearchResult };
