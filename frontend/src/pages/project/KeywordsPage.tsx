import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Sparkles, Copy, Check, Trash2 } from 'lucide-react';
import { keywordApi } from '@/services/api';
import type { Keyword } from '@/types';
import { cn } from '@/lib/utils';

const DATABASES = [
  { id: 'wos', name: 'Web of Science' },
  { id: 'scopus', name: 'Scopus' },
  { id: 'pubmed', name: 'PubMed' },
];

export default function KeywordsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const pid = Number(projectId!);

  const [activeLevel, setActiveLevel] = useState<1 | 2 | 3 | 'all'>(1);
  const [formTerm, setFormTerm] = useState('');
  const [formTermEn, setFormTermEn] = useState('');
  const [formLevel, setFormLevel] = useState<1 | 2 | 3>(1);
  const [formCategory, setFormCategory] = useState('');
  const [formSynonyms, setFormSynonyms] = useState('');
  const [expandSeeds, setExpandSeeds] = useState('');
  const [selectedDb, setSelectedDb] = useState('wos');
  const [copied, setCopied] = useState(false);

  const { data: keywordsData, isLoading } = useQuery({
    queryKey: ['keywords', pid, activeLevel === 'all' ? undefined : activeLevel],
    queryFn: () =>
      keywordApi.list(pid, activeLevel === 'all' ? undefined : activeLevel),
    enabled: !!pid,
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Keyword>) => keywordApi.create(pid, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['keywords', pid] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      setFormTerm('');
      setFormTermEn('');
      setFormCategory('');
      setFormSynonyms('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (keywordId: number) => keywordApi.delete(pid, keywordId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['keywords', pid] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });

  const expandMutation = useMutation({
    mutationFn: (seedTerms: string[]) => keywordApi.expand(pid, seedTerms),
    onSuccess: (res) => {
      const terms = res?.data?.expanded_terms ?? [];
      if (terms.length > 0) {
        terms.forEach((t: { term: string; term_zh?: string }) => {
          createMutation.mutate({
            term: t.term_zh || t.term,
            term_en: t.term,
            level: 1,
          });
        });
      }
      setExpandSeeds('');
    },
  });

  const formulaQuery = useQuery({
    queryKey: ['keywords', 'formula', pid, selectedDb],
    queryFn: () => keywordApi.searchFormula(pid, selectedDb),
    enabled: !!pid,
  });

  const keywords: Keyword[] = keywordsData?.data ?? [];
  const formula = formulaQuery.data?.data?.formula ?? '';

  const handleAddKeyword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTerm.trim()) return;
    createMutation.mutate({
      term: formTerm.trim(),
      term_en: formTermEn.trim() || undefined,
      level: formLevel,
      category: formCategory.trim() || undefined,
      synonyms: formSynonyms.trim() || undefined,
    });
  };

  const handleExpand = () => {
    const seeds = expandSeeds
      .split(/[,，\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (seeds.length > 0) expandMutation.mutate(seeds);
  };

  const copyFormula = () => {
    navigator.clipboard.writeText(formula);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const byLevel = {
    1: keywords.filter((k) => k.level === 1),
    2: keywords.filter((k) => k.level === 2),
    3: keywords.filter((k) => k.level === 3),
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Keywords</h1>

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Add Keyword
        </h2>
        <form onSubmit={handleAddKeyword} className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Term (required)"
            value={formTerm}
            onChange={(e) => setFormTerm(e.target.value)}
            className="min-w-[120px] rounded-lg border border-border bg-background px-3 py-2 text-sm"
            required
          />
          <input
            type="text"
            placeholder="Term (EN)"
            value={formTermEn}
            onChange={(e) => setFormTermEn(e.target.value)}
            className="min-w-[120px] rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <select
            value={formLevel}
            onChange={(e) => setFormLevel(Number(e.target.value) as 1 | 2 | 3)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value={1}>Level 1</option>
            <option value={2}>Level 2</option>
            <option value={3}>Level 3</option>
          </select>
          <input
            type="text"
            placeholder="Category"
            value={formCategory}
            onChange={(e) => setFormCategory(e.target.value)}
            className="min-w-[100px] rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="Synonyms (comma-separated)"
            value={formSynonyms}
            onChange={(e) => setFormSynonyms(e.target.value)}
            className="min-w-[180px] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            <Plus className="size-4" />
            Add
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          AI Expand
        </h2>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="Seed terms (comma-separated)"
            value={expandSeeds}
            onChange={(e) => setExpandSeeds(e.target.value)}
            className="min-w-[200px] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            onClick={handleExpand}
            disabled={expandMutation.isPending || !expandSeeds.trim()}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent/90 disabled:opacity-50">
            <Sparkles className="size-4" />
            Expand
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Search Formula
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedDb}
            onChange={(e) => setSelectedDb(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
            {DATABASES.map((db) => (
              <option key={db.id} value={db.id}>
                {db.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => formulaQuery.refetch()}
            disabled={formulaQuery.isFetching}
            className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm hover:bg-secondary/80 disabled:opacity-50">
            Generate
          </button>
          {formula && (
            <button
              onClick={copyFormula}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              {copied ? (
                <Check className="size-4" />
              ) : (
                <Copy className="size-4" />
              )}{' '}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          )}
        </div>
        {formulaQuery.isFetching && (
          <p className="mt-2 text-sm text-muted-foreground">Generating...</p>
        )}
        {formula && (
          <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-background p-3 text-sm">
            {formula}
          </pre>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex gap-2">
          {([1, 2, 3, 'all'] as const).map((level) => (
            <button
              key={level}
              onClick={() => setActiveLevel(level)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium',
                activeLevel === level
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
              )}>
              Level {level}
            </button>
          ))}
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : (
          <div className="space-y-4">
            {(activeLevel === 'all' ? [1, 2, 3] : [activeLevel]).map((level) => (
              <div key={level}>
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                  Level {level}
                </h3>
                <ul className="flex flex-wrap gap-2">
                  {byLevel[level as 1 | 2 | 3].map((kw) => (
                    <li
                      key={kw.id}
                      className="flex items-center gap-1 rounded-full border border-border bg-secondary px-3 py-1 text-sm">
                      <span className="text-foreground">
                        {kw.term}
                        {kw.term_en && (
                          <span className="text-muted-foreground">
                            {' '}
                            ({kw.term_en})
                          </span>
                        )}
                      </span>
                      <button
                        onClick={() => {
                          if (confirm('Delete this keyword?')) {
                            deleteMutation.mutate(kw.id);
                          }
                        }}
                        className="ml-1 rounded p-0.5 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground">
                        <Trash2 className="size-3" />
                      </button>
                    </li>
                  ))}
                  {byLevel[level as 1 | 2 | 3].length === 0 && (
                    <li className="text-sm text-muted-foreground">
                      No keywords
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
