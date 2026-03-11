import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const SOURCE_OPTIONS = [
  { id: 'semantic_scholar', name: 'Semantic Scholar' },
  { id: 'openalex', name: 'OpenAlex' },
  { id: 'arxiv', name: 'arXiv' },
  { id: 'crossref', name: 'Crossref' },
];

interface SearchQueryStepProps {
  query: string;
  onQueryChange: (q: string) => void;
  sources: string[];
  onToggleSource: (id: string) => void;
  maxResults: number;
  onMaxResultsChange: (n: number) => void;
  onSearch: () => void;
  error: string | null;
}

export function SearchQueryStep({
  query,
  onQueryChange,
  sources,
  onToggleSource,
  maxResults,
  onMaxResultsChange,
  onSearch,
  error,
}: SearchQueryStepProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 py-2">
      <div>
        <label className="mb-1.5 block text-sm font-medium">
          {t('kb.searchAdd.keywords')}
        </label>
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={t('kb.searchAdd.queryPlaceholder')}
          onKeyDown={(e) => e.key === 'Enter' && onSearch()}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium">
          {t('kb.searchAdd.sources')}
        </label>
        <div className="flex flex-wrap gap-2">
          {SOURCE_OPTIONS.map((s) => (
            <label
              key={s.id}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                sources.includes(s.id)
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-background hover:border-primary/50',
              )}
            >
              <input
                type="checkbox"
                checked={sources.includes(s.id)}
                onChange={() => onToggleSource(s.id)}
                className="sr-only"
              />
              {s.name}
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium">
          {t('kb.searchAdd.maxResults')}
        </label>
        <input
          type="range"
          min={10}
          max={100}
          step={10}
          value={maxResults}
          onChange={(e) => onMaxResultsChange(Number(e.target.value))}
          className="w-full max-w-xs accent-primary"
        />
        <span className="ml-2 text-sm text-muted-foreground">{maxResults}</span>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
