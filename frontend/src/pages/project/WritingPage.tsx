import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useToastMutation } from '@/hooks/use-toast-mutation';
import { FileText, Quote, List, BarChart3, Loader2 } from 'lucide-react';
import { paperApi, writingApi } from '@/services/api';
import type { Paper } from '@/types';
import { cn } from '@/lib/utils';

const CITE_STYLES = [
  { id: 'gb_t_7714', label: 'GB/T 7714' },
  { id: 'apa', label: 'APA' },
  { id: 'mla', label: 'MLA' },
  { id: 'chicago', label: 'Chicago' },
];

export default function WritingPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId!);

  const TABS = [
    { id: 'summarize', label: t('writing.tabs.summarize'), icon: FileText },
    { id: 'cite', label: t('writing.tabs.cite'), icon: Quote },
    { id: 'outline', label: t('writing.tabs.outline'), icon: List },
    { id: 'gap', label: t('writing.tabs.gap'), icon: BarChart3 },
  ];

  const [activeTab, setActiveTab] = useState('summarize');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [topic, setTopic] = useState('');
  const [researchTopic, setResearchTopic] = useState('');
  const [citeStyle, setCiteStyle] = useState('gb_t_7714');
  const [language, setLanguage] = useState('en');
  const [output, setOutput] = useState('');

  const { data: papersData } = useQuery({
    queryKey: ['papers', pid],
    queryFn: () => paperApi.list(pid),
    enabled: !!pid,
  });

  const papers: Paper[] = papersData?.items ?? [];

  const summarizeMutation = useToastMutation({
    mutationFn: () =>
      writingApi.summarize(pid, selectedIds, language),
    errorMessage: t('common.operationFailed'),
    onSuccess: (res) => {
      const summaries = res?.summaries ?? [];
      setOutput(
        summaries.map((s: { title?: string; summary?: string }) => `## ${s.title}\n${s.summary}`).join('\n\n')
      );
    },
  });

  const citeMutation = useToastMutation({
    mutationFn: () =>
      writingApi.citations(pid, selectedIds, citeStyle),
    errorMessage: t('common.operationFailed'),
    onSuccess: (res) => {
      const citations = res?.citations ?? [];
      setOutput(citations.map((c: { citation?: string }) => c.citation ?? '').join('\n'));
    },
  });

  const outlineMutation = useToastMutation({
    mutationFn: () =>
      writingApi.reviewOutline(pid, topic, language),
    errorMessage: t('common.operationFailed'),
    onSuccess: (res) => {
      setOutput(res?.outline ?? '');
    },
    onError: () => setOutput(''),
  });

  const gapMutation = useToastMutation({
    mutationFn: () =>
      writingApi.gapAnalysis(pid, researchTopic),
    errorMessage: t('common.operationFailed'),
    onSuccess: (res) => {
      setOutput(res?.analysis ?? '');
    },
    onError: () => setOutput(''),
  });

  const togglePaper = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const runAction = () => {
    setOutput('');
    if (activeTab === 'summarize') {
      if (selectedIds.length > 0) summarizeMutation.mutate();
    } else if (activeTab === 'cite') {
      if (selectedIds.length > 0) citeMutation.mutate();
    } else if (activeTab === 'outline') {
      if (topic.trim()) outlineMutation.mutate();
    } else if (activeTab === 'gap') {
      if (researchTopic.trim()) gapMutation.mutate();
    }
  };

  const isPending =
    summarizeMutation.isPending ||
    citeMutation.isPending ||
    outlineMutation.isPending ||
    gapMutation.isPending;

  const canRun =
    (activeTab === 'summarize' && selectedIds.length > 0) ||
    (activeTab === 'cite' && selectedIds.length > 0) ||
    (activeTab === 'outline' && topic.trim().length > 0) ||
    (activeTab === 'gap' && researchTopic.trim().length > 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">{t('writing.title')}</h1>

      <div className="flex gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium',
              activeTab === tab.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
            )}>
            <tab.icon className="size-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            {activeTab === 'summarize' || activeTab === 'cite'
              ? t('writing.selectPapers')
              : activeTab === 'outline'
                ? t('writing.topic')
                : t('writing.researchTopic')}
          </h2>

          {(activeTab === 'summarize' || activeTab === 'cite') && (
            <div className="max-h-64 overflow-y-auto space-y-2">
              {papers.map((p) => (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-2 hover:bg-muted/50">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(p.id)}
                    onChange={() => togglePaper(p.id)}
                    className="rounded"
                  />
                  <span className="line-clamp-1 text-sm">{p.title}</span>
                </label>
              ))}
              {papers.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('writing.noPapers')}</p>
              )}
            </div>
          )}

          {activeTab === 'outline' && (
            <input
              type="text"
              placeholder={t('writing.topicPlaceholder')}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          )}

          {activeTab === 'gap' && (
            <input
              type="text"
              placeholder={t('writing.researchTopicPlaceholder')}
              value={researchTopic}
              onChange={(e) => setResearchTopic(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          )}

          {activeTab === 'cite' && (
            <div className="mt-3">
              <label className="mb-1 block text-xs text-muted-foreground">
                {t('writing.citeStyle')}
              </label>
              <select
                value={citeStyle}
                onChange={(e) => setCiteStyle(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                {CITE_STYLES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(activeTab === 'summarize' || activeTab === 'outline') && (
            <div className="mt-3">
              <label className="mb-1 block text-xs text-muted-foreground">
                {t('writing.language')}
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="en">{t('writing.langEn')}</option>
                <option value="zh">{t('writing.langZh')}</option>
              </select>
            </div>
          )}

          <button
            onClick={runAction}
            disabled={isPending || !canRun}
            className="mt-4 flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}{' '}
            {t('common.generate')}
          </button>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold text-foreground">{t('common.output')}</h2>
          <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-background p-3 text-sm">
            {output || (isPending ? t('common.generating') : '—')}
          </pre>
        </div>
      </div>
    </div>
  );
}
