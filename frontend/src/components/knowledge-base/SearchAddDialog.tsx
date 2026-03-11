import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Loader2, FileText, ChevronRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { kbApi, type NewPaperData } from '@/services/kb-api';
import { cn } from '@/lib/utils';

const SOURCE_OPTIONS = [
  { id: 'semantic_scholar', name: 'Semantic Scholar' },
  { id: 'openalex', name: 'OpenAlex' },
  { id: 'arxiv', name: 'arXiv' },
  { id: 'crossref', name: 'Crossref' },
];

interface SearchResult extends NewPaperData {
  source_id?: string;
  pdf_url?: string;
}

interface SearchAddDialogProps {
  projectId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

const STEPS = [
  { key: 'query', label: 'kb.searchAdd.stepQuery' },
  { key: 'results', label: 'kb.searchAdd.stepResults' },
  { key: 'select', label: 'kb.searchAdd.stepSelect' },
];

export function SearchAddDialog({
  projectId,
  open,
  onOpenChange,
  onComplete,
}: SearchAddDialogProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState('');
  const [sources, setSources] = useState<string[]>(['semantic_scholar', 'openalex']);
  const [maxResults, setMaxResults] = useState(50);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStep(0);
    setQuery('');
    setSources(['semantic_scholar', 'openalex']);
    setMaxResults(50);
    setResults([]);
    setSelected(new Set());
    setError(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const toggleSource = (id: string) => {
    setSources((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const toggleSelect = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === results.length) setSelected(new Set());
    else setSelected(new Set(results.map((_, i) => i)));
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    setError(null);
    try {
      const res = await kbApi.searchAndAdd(projectId, query.trim(), sources, maxResults);
      const papers = (res?.data as { papers?: SearchResult[] })?.papers ?? [];
      setResults(papers);
      setSelected(new Set());
      setStep(1);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: string }).message)
          : t('kb.searchAdd.searchError');
      setError(msg);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddSelected = async () => {
    const toAdd = Array.from(selected)
      .sort((a, b) => a - b)
      .map((i) => results[i])
      .map((p) => ({
        title: p.title,
        abstract: p.abstract,
        authors: p.authors,
        doi: p.doi,
        year: p.year,
        journal: p.journal,
        source: p.source,
      }));
    if (toAdd.length === 0) return;
    setIsImporting(true);
    setError(null);
    try {
      await kbApi.bulkImport(projectId, toAdd);
      onComplete();
      handleOpenChange(false);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: string }).message)
          : t('kb.searchAdd.importError');
      setError(msg);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('kb.searchAdd.title')}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 py-2">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex items-center gap-1">
              <div
                className={cn(
                  'flex size-8 items-center justify-center rounded-full text-sm font-medium',
                  i < step
                    ? 'bg-primary text-primary-foreground'
                    : i === step
                      ? 'border-2 border-primary bg-primary/10 text-primary'
                      : 'border border-border bg-muted text-muted-foreground'
                )}
              >
                {i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <ChevronRight className="size-4 text-muted-foreground" />
              )}
            </div>
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-4 py-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                {t('kb.searchAdd.keywords')}
              </label>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('kb.searchAdd.keywordsPlaceholder')}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
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
                        : 'border-border bg-background hover:border-primary/50'
                    )}
                  >
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
              <label className="mb-1.5 block text-sm font-medium">
                {t('kb.searchAdd.maxResults', { count: maxResults })}
              </label>
              <input
                type="range"
                min={10}
                max={100}
                step={10}
                value={maxResults}
                onChange={(e) => setMaxResults(Number(e.target.value))}
                className="w-full max-w-xs accent-primary"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4 py-2">
            {isSearching ? (
              <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
                {t('kb.searchAdd.searching')}
              </div>
            ) : results.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                {t('kb.searchAdd.noResults')}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <Badge variant="secondary">
                    {t('kb.searchAdd.resultsCount', { count: results.length })}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStep(2)}
                  >
                    {t('kb.searchAdd.selectPapers')}
                  </Button>
                </div>
                <ul className="max-h-64 space-y-2 overflow-y-auto rounded-md border border-border p-2">
                  {results.map((paper, i) => (
                    <li
                      key={paper.source_id ?? paper.doi ?? `paper-${i}`}
                      className="rounded-lg border border-border p-3 hover:bg-muted/30"
                    >
                      <div className="font-medium">{paper.title}</div>
                      {paper.authors && paper.authors.length > 0 && (
                        <div className="text-sm text-muted-foreground">
                          {paper.authors.map((a) => a.name).join(', ')}
                        </div>
                      )}
                      {paper.journal && (
                        <div className="text-sm text-muted-foreground">
                          {paper.journal}
                          {paper.year && ` (${paper.year})`}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <Badge variant="secondary">
                {t('kb.searchAdd.selectedCount', { count: selected.size })}
              </Badge>
              <Button variant="ghost" size="sm" onClick={selectAll}>
                {selected.size === results.length
                  ? t('kb.searchAdd.deselectAll')
                  : t('kb.searchAdd.selectAll')}
              </Button>
            </div>
            <ul className="max-h-64 space-y-2 overflow-y-auto rounded-md border border-border p-2">
              {results.map((paper, i) => (
                <label
                  key={paper.source_id ?? paper.doi ?? `paper-${i}`}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                    selected.has(i)
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/30'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(i)}
                    onChange={() => toggleSelect(i)}
                    className="mt-1 rounded border-border"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{paper.title}</div>
                    {paper.authors && paper.authors.length > 0 && (
                      <div className="text-sm text-muted-foreground">
                        {paper.authors.map((a) => a.name).join(', ')}
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </ul>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter>
          {step === 0 && (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleSearch}
                disabled={!query.trim() || isSearching}
              >
                {isSearching ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {t('kb.searchAdd.searching')}
                  </>
                ) : (
                  <>
                    <Search className="size-4" />
                    {t('common.search')}
                  </>
                )}
              </Button>
            </>
          )}
          {step === 1 && (
            <>
              <Button variant="outline" onClick={() => setStep(0)}>
                {t('common.back')}
              </Button>
              <Button
                onClick={() => setStep(2)}
                disabled={results.length === 0}
              >
                {t('kb.searchAdd.selectPapers')}
              </Button>
            </>
          )}
          {step === 2 && (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>
                {t('common.back')}
              </Button>
              <Button
                onClick={handleAddSelected}
                disabled={selected.size === 0 || isImporting}
              >
                {isImporting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {t('kb.searchAdd.importing')}
                  </>
                ) : (
                  <>
                    <FileText className="size-4" />
                    {t('kb.searchAdd.addSelected')}
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
