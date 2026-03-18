import { useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiUrl } from '@/lib/api-config';
import { useQuery } from '@tanstack/react-query';
import { useToastMutation } from '@/hooks/use-toast-mutation';
import {
  FileText,
  Quote,
  List,
  BarChart3,
  Loader2,
  BookOpen,
  Copy,
  Download,
  Square,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { paperApi, writingApi } from '@/services/api';
import type { Paper } from '@/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useThrottledValue } from '@/hooks/useThrottledValue';
import { queryKeys } from '@/lib/query-keys';
import PageLayout from '@/components/layout/PageLayout';

const CITE_STYLES = [
  { id: 'gb_t_7714', label: 'GB/T 7714' },
  { id: 'apa', label: 'APA' },
  { id: 'mla', label: 'MLA' },
  { id: 'chicago', label: 'Chicago' },
];

const REVIEW_STYLES = [
  { id: 'narrative', labelKey: 'writing.styleNarrative' },
  { id: 'systematic', labelKey: 'writing.styleSystematic' },
  { id: 'thematic', labelKey: 'writing.styleThematic' },
];

export default function WritingPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId!);

  const [activeTab, setActiveTab] = useState('summarize');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [topic, setTopic] = useState('');
  const [researchTopic, setResearchTopic] = useState('');
  const [citeStyle, setCiteStyle] = useState('gb_t_7714');
  const [language, setLanguage] = useState('en');
  const [output, setOutput] = useState('');

  const [reviewTopic, setReviewTopic] = useState('');
  const [reviewStyle, setReviewStyle] = useState('narrative');
  const [reviewLang, setReviewLang] = useState('zh');
  const [reviewStreaming, setReviewStreaming] = useState(false);
  const [reviewSections, setReviewSections] = useState<string[]>([]);
  const [reviewContent, setReviewContent] = useState('');
  const [reviewCitations, setReviewCitations] = useState<
    Record<string, { paper_id: number; title: string; number: number }>
  >({});
  const [currentSection, setCurrentSection] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const displayContent = useThrottledValue(reviewContent, 80);

  const { data: papersData } = useQuery({
    queryKey: queryKeys.papers.list(pid),
    queryFn: () => paperApi.list(pid),
    enabled: !!pid,
  });

  const papers: Paper[] = papersData?.items ?? [];

  const summarizeMutation = useToastMutation({
    mutationFn: () => writingApi.summarize(pid, selectedIds, language),
    errorMessage: t('common.operationFailed'),
    onSuccess: (res) => {
      const summaries = res?.summaries ?? [];
      setOutput(
        summaries
          .map(
            (s: { title?: string; summary?: string }) =>
              `## ${s.title}\n${s.summary}`
          )
          .join('\n\n')
      );
    },
  });

  const citeMutation = useToastMutation({
    mutationFn: () => writingApi.citations(pid, selectedIds, citeStyle),
    errorMessage: t('common.operationFailed'),
    onSuccess: (res) => {
      const citations = res?.citations ?? [];
      setOutput(
        citations.map((c: { citation?: string }) => c.citation ?? '').join('\n')
      );
    },
  });

  const outlineMutation = useToastMutation({
    mutationFn: () => writingApi.reviewOutline(pid, topic, language),
    errorMessage: t('common.operationFailed'),
    onSuccess: (res) => {
      setOutput(res?.outline ?? '');
    },
    onError: () => setOutput(''),
  });

  const gapMutation = useToastMutation({
    mutationFn: () => writingApi.gapAnalysis(pid, researchTopic),
    errorMessage: t('common.operationFailed'),
    onSuccess: (res) => {
      setOutput(res?.analysis ?? '');
    },
    onError: () => setOutput(''),
  });

  const startReviewStream = useCallback(async () => {
    if (reviewStreaming) return;
    setReviewStreaming(true);
    setReviewContent('');
    setReviewSections([]);
    setReviewCitations({});
    setCurrentSection('');

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch(
        apiUrl(`/projects/${pid}/writing/review-draft/stream`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: reviewTopic,
            style: reviewStyle,
            language: reviewLang,
          }),
          signal: ctrl.signal,
        }
      );

      if (!res.ok || !res.body) {
        toast.error(t('common.operationFailed'));
        setReviewStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const raw = line.slice(6);
            try {
              const data = JSON.parse(raw);
              switch (currentEvent) {
                case 'outline':
                  setReviewSections(data.sections ?? []);
                  break;
                case 'section-start':
                  setCurrentSection(data.title ?? '');
                  setReviewContent((prev) => prev + `\n\n## ${data.title}\n\n`);
                  break;
                case 'text-delta':
                  setReviewContent((prev) => prev + (data.delta ?? ''));
                  break;
                case 'citation-map':
                  setReviewCitations(data.citations ?? {});
                  break;
                case 'error':
                  toast.error(data.message ?? t('common.operationFailed'));
                  break;
              }
            } catch {
              /* skip malformed JSON */
            }
            currentEvent = '';
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        toast.error(t('common.operationFailed'));
      }
    } finally {
      setReviewStreaming(false);
      setCurrentSection('');
      abortRef.current = null;
    }
  }, [pid, reviewTopic, reviewStyle, reviewLang, reviewStreaming, t]);

  const stopReviewStream = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const copyReviewContent = useCallback(() => {
    navigator.clipboard.writeText(reviewContent.trim());
    toast.success(t('common.copied', '已复制到剪贴板'));
  }, [reviewContent, t]);

  const downloadReview = useCallback(() => {
    const blob = new Blob([reviewContent.trim()], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `literature-review-${reviewTopic || 'draft'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [reviewContent, reviewTopic]);

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
    (activeTab === 'gap' && researchTopic.trim().length > 0) ||
    activeTab === 'review';

  return (
    <PageLayout title={t('writing.title')}>
      <div className="space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList>
            <TabsTrigger value="summarize" className="gap-1.5">
              <FileText className="size-4" />
              {t('writing.tabs.summarize')}
            </TabsTrigger>
            <TabsTrigger value="cite" className="gap-1.5">
              <Quote className="size-4" />
              {t('writing.tabs.cite')}
            </TabsTrigger>
            <TabsTrigger value="outline" className="gap-1.5">
              <List className="size-4" />
              {t('writing.tabs.outline')}
            </TabsTrigger>
            <TabsTrigger value="gap" className="gap-1.5">
              <BarChart3 className="size-4" />
              {t('writing.tabs.gap')}
            </TabsTrigger>
            <TabsTrigger value="review" className="gap-1.5">
              <BookOpen className="size-4" />
              {t('writing.tabs.review', '综述生成')}
            </TabsTrigger>
          </TabsList>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold text-foreground">
                {activeTab === 'summarize' || activeTab === 'cite'
                  ? t('writing.selectPapers')
                  : activeTab === 'outline'
                    ? t('writing.topic')
                    : t('writing.researchTopic')}
              </h2>

              {(activeTab === 'summarize' || activeTab === 'cite') && (
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {papers.map((p) => (
                    <label
                      key={p.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-2 hover:bg-muted/50"
                    >
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
                    <p className="text-sm text-muted-foreground">
                      {t('writing.noPapers')}
                    </p>
                  )}
                </div>
              )}

              {activeTab === 'outline' && (
                <Input
                  placeholder={t('writing.topicPlaceholder')}
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                />
              )}

              {activeTab === 'gap' && (
                <Input
                  placeholder={t('writing.researchTopicPlaceholder')}
                  value={researchTopic}
                  onChange={(e) => setResearchTopic(e.target.value)}
                />
              )}

              {activeTab === 'cite' && (
                <div className="mt-3">
                  <label className="mb-1 block text-xs text-muted-foreground">
                    {t('writing.citeStyle')}
                  </label>
                  <Select
                    value={citeStyle}
                    onValueChange={setCiteStyle}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CITE_STYLES.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(activeTab === 'summarize' || activeTab === 'outline') && (
                <div className="mt-3">
                  <label className="mb-1 block text-xs text-muted-foreground">
                    {t('writing.language')}
                  </label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">{t('writing.langEn')}</SelectItem>
                      <SelectItem value="zh">{t('writing.langZh')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {activeTab === 'review' && (
                <div className="space-y-3">
                  <Input
                    placeholder={t(
                      'writing.reviewTopicPlaceholder',
                      '综述主题（可留空自动确定）'
                    )}
                    value={reviewTopic}
                    onChange={(e) => setReviewTopic(e.target.value)}
                  />
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">
                      {t('writing.reviewStyle', '综述风格')}
                    </label>
                    <Select
                      value={reviewStyle}
                      onValueChange={setReviewStyle}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {REVIEW_STYLES.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {t(s.labelKey)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">
                      {t('writing.language')}
                    </label>
                    <Select value={reviewLang} onValueChange={setReviewLang}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="zh">
                          {t('writing.langZh')}
                        </SelectItem>
                        <SelectItem value="en">
                          {t('writing.langEn')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {reviewSections.length > 0 && (
                    <div className="rounded-lg border border-border bg-muted/30 p-3">
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        {t('writing.reviewOutline', '综述提纲')}
                      </p>
                      <ol className="list-decimal space-y-0.5 pl-4 text-sm">
                        {reviewSections.map((s, i) => (
                          <li
                            key={i}
                            className={cn(
                              currentSection === s && 'font-semibold text-primary'
                            )}
                          >
                            {s}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              )}

              {activeTab !== 'review' ? (
                <Button
                  onClick={runAction}
                  disabled={isPending || !canRun}
                  className="mt-4 gap-1.5"
                >
                  {isPending && <Loader2 className="size-4 animate-spin" />}
                  {t('common.generate')}
                </Button>
              ) : (
                <div className="mt-4 flex gap-2">
                  <Button
                    onClick={startReviewStream}
                    disabled={reviewStreaming}
                    className="gap-1.5"
                  >
                    {reviewStreaming && (
                      <Loader2 className="size-4 animate-spin" />
                    )}
                    {t('writing.generateReview', '生成综述草稿')}
                  </Button>
                  {reviewStreaming && (
                    <Button
                      variant="outline"
                      onClick={stopReviewStream}
                      className="gap-1.5"
                    >
                      <Square className="size-4" />
                      {t('common.stop', '停止')}
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">
                  {t('common.output')}
                </h2>
                {activeTab === 'review' && reviewContent.trim() && (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={copyReviewContent}
                      className="gap-1 text-xs"
                    >
                      <Copy className="size-3.5" />
                      {t('common.copy', '复制')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={downloadReview}
                      className="gap-1 text-xs"
                    >
                      <Download className="size-3.5" />
                      {t('common.download', '下载')}
                    </Button>
                  </div>
                )}
              </div>
              {activeTab === 'review' ? (
                <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-background p-4">
                  {displayContent.trim() ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                      {displayContent}
                      {reviewStreaming && (
                        <span className="ml-1 inline-block size-2 animate-pulse rounded-full bg-primary" />
                      )}
                    </div>
                  ) : reviewStreaming ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      {t('common.generating', '正在生成...')}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">—</p>
                  )}
                  {Object.keys(reviewCitations).length > 0 && !reviewStreaming && (
                    <div className="mt-6 border-t border-border pt-4">
                      <h3 className="mb-2 text-sm font-semibold">
                        {t('writing.references', '参考文献')}
                      </h3>
                      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                        {Object.entries(reviewCitations)
                          .sort(([a], [b]) => Number(a) - Number(b))
                          .map(([num, cite]) => (
                            <li key={num}>{cite.title}</li>
                          ))}
                      </ol>
                    </div>
                  )}
                </div>
              ) : (
                <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-background p-3 text-sm">
                  {output || (isPending ? t('common.generating') : '—')}
                </pre>
              )}
            </div>
          </div>
        </Tabs>
      </div>
    </PageLayout>
  );
}
