import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useToastMutation } from '@/hooks/use-toast-mutation';
import { Plus, Sparkles, Copy, Check, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { LoadingState } from '@/components/ui/loading-state';
import { keywordApi } from '@/services/api';
import type { Keyword } from '@/types';
import { cn } from '@/lib/utils';

const DATABASES = [
  { id: 'wos', name: 'Web of Science' },
  { id: 'scopus', name: 'Scopus' },
  { id: 'pubmed', name: 'PubMed' },
];

export default function KeywordsPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
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

  const createMutation = useToastMutation({
    mutationFn: (data: Partial<Keyword>) => keywordApi.create(pid, data),
    successMessage: t('common.createSuccess'),
    errorMessage: t('common.createFailed'),
    invalidateKeys: [['keywords', pid], ['project', projectId]],
    onSuccess: () => {
      setFormTerm('');
      setFormTermEn('');
      setFormCategory('');
      setFormSynonyms('');
    },
  });

  const deleteMutation = useToastMutation({
    mutationFn: (keywordId: number) => keywordApi.delete(pid, keywordId),
    successMessage: t('common.deleteSuccess'),
    errorMessage: t('common.deleteFailed'),
    invalidateKeys: [['keywords', pid], ['project', projectId]],
  });

  const expandMutation = useToastMutation({
    mutationFn: (seedTerms: string[]) => keywordApi.expand(pid, seedTerms),
    successMessage: t('keywords.expandSuccess'),
    errorMessage: t('keywords.expandFailed'),
    invalidateKeys: [['keywords', pid], ['project', projectId]],
    onSuccess: (res) => {
      const terms = res?.expanded_terms ?? [];
      if (terms.length > 0) {
        terms.forEach((item: string | { term: string; term_zh?: string; relation?: string }) => {
          const termStr = typeof item === 'string' ? item : item.term;
          const termEn = typeof item === 'string' ? item : item.term;
          createMutation.mutate({
            term: termStr,
            term_en: termEn,
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

  const keywords: Keyword[] = keywordsData ?? [];
  const formula = formulaQuery.data?.formula ?? '';

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

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          {t('keywords.addKeyword')}
        </h2>
        <form onSubmit={handleAddKeyword} className="flex flex-wrap gap-3">
          <Input
            placeholder={t('keywords.term')}
            value={formTerm}
            onChange={(e) => setFormTerm(e.target.value)}
            className="min-w-[120px] w-auto"
            required
          />
          <Input
            placeholder={t('keywords.termEn')}
            value={formTermEn}
            onChange={(e) => setFormTermEn(e.target.value)}
            className="min-w-[120px] w-auto"
          />
          <select
            value={formLevel}
            onChange={(e) => setFormLevel(Number(e.target.value) as 1 | 2 | 3)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs">
            <option value={1}>{t('keywords.level', { level: 1 })}</option>
            <option value={2}>{t('keywords.level', { level: 2 })}</option>
            <option value={3}>{t('keywords.level', { level: 3 })}</option>
          </select>
          <Input
            placeholder={t('keywords.category')}
            value={formCategory}
            onChange={(e) => setFormCategory(e.target.value)}
            className="min-w-[100px] w-auto"
          />
          <Input
            placeholder={t('keywords.synonyms')}
            value={formSynonyms}
            onChange={(e) => setFormSynonyms(e.target.value)}
            className="min-w-[180px] flex-1"
          />
          <Button type="submit" disabled={createMutation.isPending} className="gap-1.5">
            <Plus className="size-4" />
            {t('common.add')}
          </Button>
        </form>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          {t('keywords.aiExpand')}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder={t('keywords.seedTerms')}
            value={expandSeeds}
            onChange={(e) => setExpandSeeds(e.target.value)}
            className="min-w-[200px] flex-1"
          />
          <Button
            variant="secondary"
            onClick={handleExpand}
            disabled={expandMutation.isPending || !expandSeeds.trim()}
            className="gap-1.5"
          >
            <Sparkles className="size-4" />
            {t('keywords.expand')}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          {t('keywords.searchFormula')}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedDb}
            onChange={(e) => setSelectedDb(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs">
            {DATABASES.map((db) => (
              <option key={db.id} value={db.id}>
                {db.name}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            onClick={() => formulaQuery.refetch()}
            disabled={formulaQuery.isFetching}
          >
            {t('common.generate')}
          </Button>
          {formula && (
            <Button onClick={copyFormula} className="gap-1.5">
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? t('common.copied') : t('common.copy')}
            </Button>
          )}
        </div>
        {formulaQuery.isFetching && (
          <p className="mt-2 text-sm text-muted-foreground">{t('common.generating')}</p>
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
              {t('keywords.level', { level })}
            </button>
          ))}
        </div>

        {isLoading ? (
          <LoadingState message={t('common.loading')} />
        ) : (
          <div className="space-y-4">
            {(activeLevel === 'all' ? [1, 2, 3] : [activeLevel]).map((level) => (
              <div key={level}>
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                  {t('keywords.level', { level })}
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
                      <ConfirmDialog
                        trigger={
                          <button className="ml-1 rounded p-0.5 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground">
                            <Trash2 className="size-3" />
                          </button>
                        }
                        title={t('common.confirmDeleteTitle')}
                        description={t('keywords.confirmDelete')}
                        confirmText={t('common.delete')}
                        cancelText={t('common.cancel')}
                        onConfirm={() => deleteMutation.mutate(kw.id)}
                        destructive
                      />
                    </li>
                  ))}
                  {byLevel[level as 1 | 2 | 3].length === 0 && (
                    <li className="text-sm text-muted-foreground">
                      {t('keywords.noKeywords')}
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
