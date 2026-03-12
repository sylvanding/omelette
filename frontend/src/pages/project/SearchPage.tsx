import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useToastMutation } from '@/hooks/use-toast-mutation';
import { Search, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { searchApi, paperApi, type SearchSource } from '@/services/api';
import { cn } from '@/lib/utils';

const SOURCE_OPTIONS = [
  { id: 'semantic_scholar', name: 'Semantic Scholar' },
  { id: 'openalex', name: 'OpenAlex' },
  { id: 'arxiv', name: 'arXiv' },
  { id: 'crossref', name: 'Crossref' },
];

interface SearchPaper {
  title: string;
  abstract?: string;
  authors?: { name?: string }[];
  journal?: string;
  year?: number;
  citation_count?: number;
  source?: string;
  source_id?: string;
  doi?: string;
  pdf_url?: string;
}

export default function SearchPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId!);

  const [query, setQuery] = useState('');
  const [sources, setSources] = useState<string[]>(['semantic_scholar', 'openalex']);
  const [maxResults, setMaxResults] = useState(50);
  const [results, setResults] = useState<SearchPaper[]>([]);
  const [imported, setImported] = useState(0);

  const { data: sourcesData } = useQuery({
    queryKey: ['search', 'sources', pid],
    queryFn: () => searchApi.sources(pid),
    enabled: !!pid,
  });

  const searchMutation = useToastMutation({
    mutationFn: (params: { query?: string; sources?: string[]; max_results?: number }) =>
      searchApi.execute(pid, {
        query: params.query || query,
        sources: params.sources || sources,
        max_results: params.max_results ?? maxResults,
      }),
    successMessage: t('searchPage.searchSuccess'),
    errorMessage: t('searchPage.searchFailed'),
    onSuccess: (res) => {
      setResults((res?.papers as unknown as SearchPaper[]) ?? []);
      setImported(res?.imported ?? 0);
    },
  });

  const importMutation = useToastMutation({
    mutationFn: (papers: SearchPaper[]) =>
      paperApi.bulkImport(
        pid,
        papers.map((p) => ({
          title: p.title,
          abstract: p.abstract ?? '',
          authors: p.authors?.map((a) => ({
            name: a.name ?? '',
            affiliation: 'affiliation' in a ? (a as { affiliation?: string }).affiliation : undefined,
          })),
          journal: p.journal ?? '',
          year: p.year ?? null,
          citation_count: p.citation_count ?? 0,
          source: p.source ?? '',
          source_id: p.source_id ?? '',
          pdf_url: p.pdf_url ?? '',
        }))
      ),
    successMessage: t('searchPage.importSuccess'),
    errorMessage: t('searchPage.importFailed'),
    invalidateKeys: [['papers', pid], ['project', projectId]],
    onSuccess: (res) => {
      setImported(res?.created ?? res?.imported ?? 0);
    },
  });

  const sourceList: SearchSource[] = sourcesData ?? SOURCE_OPTIONS;

  const toggleSource = (id: string) => {
    setSources((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    searchMutation.mutate({});
  };

  const handleImportAll = () => {
    if (results.length > 0) importMutation.mutate(results);
  };

  return (
    <div className="space-y-6">

      <form
        onSubmit={handleSearch}
        className="rounded-xl border border-border bg-card p-4 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            {t('searchPage.query')}
          </label>
          <div className="flex gap-2">
            <Input
              placeholder={t('searchPage.queryPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" disabled={searchMutation.isPending} className="gap-1.5">
              {searchMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              {t('common.search')}
            </Button>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">
            {t('searchPage.sources')}
          </label>
          <div className="flex flex-wrap gap-2">
            {sourceList.map((s) => (
              <label
                key={s.id}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm',
                  sources.includes(s.id)
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background text-muted-foreground'
                )}>
                <input
                  type="checkbox"
                  checked={sources.includes(s.id)}
                  onChange={() => toggleSource(s.id)}
                  className="sr-only"
                />
                {s.name}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            {t('searchPage.maxResults', { count: maxResults })}
          </label>
          <input
            type="range"
            min={10}
            max={200}
            step={10}
            value={maxResults}
            onChange={(e) => setMaxResults(Number(e.target.value))}
            className="w-full max-w-xs"
          />
        </div>
      </form>

      {sourceList.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold text-foreground">
            {t('searchPage.sourceStats')}
          </h2>
          <div className="flex flex-wrap gap-2">
            {sourceList.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
                {s.name}: {s.status ?? t('searchPage.available')}
              </span>
            ))}
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-muted/50 px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">
              {t('searchPage.results', { count: results.length })}
            </h2>
            <Button onClick={handleImportAll} disabled={importMutation.isPending} className="gap-1.5">
              {importMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              {t('searchPage.importAll')}
            </Button>
          </div>
          <ul className="divide-y divide-border max-h-[500px] overflow-y-auto">
            {results.map((paper, i) => (
              <li key={i} className="p-4 hover:bg-muted/20">
                <div className="font-medium text-foreground">{paper.title}</div>
                {paper.authors && paper.authors.length > 0 && (
                  <div className="text-sm text-muted-foreground">
                    {paper.authors
                      .map((a) => a.name ?? '')
                      .filter(Boolean)
                      .join(', ')}
                  </div>
                )}
                {paper.journal && (
                  <div className="text-sm text-muted-foreground">
                    {paper.journal}
                    {paper.year && ` (${paper.year})`}
                  </div>
                )}
                {paper.abstract && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {paper.abstract}
                  </p>
                )}
              </li>
            ))}
          </ul>
          {imported > 0 && (
            <div className="border-t border-border px-4 py-2 text-sm text-muted-foreground">
              {t('searchPage.imported', { count: imported })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
