import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Send, RefreshCw, Loader2, FileText, MessageSquare, AlertCircle } from 'lucide-react';
import { ragApi } from '@/services/api';
import type { IndexSSEEvent } from '@/services/api';
import { cn } from '@/lib/utils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: { paper_title?: string; content?: string }[];
}

function MarkdownBlock({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert">
      {content.split('\n').map((line, i) => (
        <p key={i} className="mb-1">
          {line}
        </p>
      ))}
    </div>
  );
}

export default function RAGChatPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const pid = Number(projectId!);

  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: statsData } = useQuery({
    queryKey: ['rag', 'stats', pid],
    queryFn: () => ragApi.stats(pid),
    enabled: !!pid,
  });

  const queryMutation = useMutation({
    mutationFn: (q: string) => ragApi.query(pid, q),
    onSuccess: (res) => {
      const answer = res?.data?.answer ?? '';
      const sources = res?.data?.sources ?? [];
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: answer, sources },
      ]);
    },
  });

  const [indexProgress, setIndexProgress] = useState<{
    active: boolean;
    stage: string;
    percent: number;
    error?: string;
  }>({ active: false, stage: '', percent: 0 });

  const abortRef = useRef<AbortController | null>(null);

  const stageLabel = useCallback(
    (stage: string) => {
      const map: Record<string, string> = {
        fetching: t('rag.rebuild.fetching'),
        loading_model: t('rag.rebuild.loadingModel'),
        preparing: t('rag.rebuild.preparing'),
        indexing: t('rag.rebuild.indexing'),
      };
      return map[stage] ?? stage;
    },
    [t],
  );

  const startRebuild = useCallback(async () => {
    if (indexProgress.active) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setIndexProgress({ active: true, stage: 'fetching', percent: 0 });

    try {
      for await (const evt of ragApi.indexStream(pid, ac.signal) as AsyncGenerator<IndexSSEEvent>) {
        if (evt.event === 'progress') {
          setIndexProgress((p) => ({
            ...p,
            stage: evt.data.stage ?? p.stage,
            percent: evt.data.percent ?? p.percent,
          }));
        } else if (evt.event === 'complete') {
          setIndexProgress({ active: false, stage: '', percent: 100 });
          queryClient.invalidateQueries({ queryKey: ['rag', 'stats', pid] });
        } else if (evt.event === 'error') {
          setIndexProgress({ active: false, stage: '', percent: 0, error: evt.data.message });
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setIndexProgress({ active: false, stage: '', percent: 0, error: String(err) });
      }
    }
  }, [pid, indexProgress.active, queryClient, t]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const stats = (statsData?.data ?? {}) as { total_chunks?: number };
  const hasIndex = (stats.total_chunks ?? 0) > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || queryMutation.isPending) return;
    setMessages((prev) => [...prev, { role: 'user', content: question.trim() }]);
    setQuestion('');
    queryMutation.mutate(question.trim());
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{t('rag.title')}</h1>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs',
              hasIndex
                ? 'bg-green-100 text-green-800'
                : 'bg-yellow-100 text-yellow-800'
            )}>
            {hasIndex ? t('rag.indexed') : t('rag.notIndexed')}
          </span>
          <button
            onClick={startRebuild}
            disabled={indexProgress.active}
            className="flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm hover:bg-secondary/80 disabled:opacity-50">
            {indexProgress.active ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}{' '}
            {indexProgress.active
              ? `${stageLabel(indexProgress.stage)} ${indexProgress.percent}%`
              : t('rag.rebuildIndex')}
          </button>
        </div>
      </div>

      {indexProgress.active && (
        <div className="mb-2 overflow-hidden rounded-lg border border-border bg-muted/50 p-3">
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Loader2 className="size-3 animate-spin" />
              {stageLabel(indexProgress.stage)}
            </span>
            <span className="tabular-nums">{indexProgress.percent}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${indexProgress.percent}%` }}
            />
          </div>
        </div>
      )}

      {indexProgress.error && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          {indexProgress.error}
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
              <MessageSquare className="mb-2 size-12" />
              <p>{t('rag.emptyHint')}</p>
              <p className="mt-1 text-sm">
                {hasIndex
                  ? t('rag.emptyHintIndexed')
                  : t('rag.emptyHintNoIndex')}
              </p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                'rounded-lg p-3',
                msg.role === 'user'
                  ? 'ml-8 bg-primary text-primary-foreground'
                  : 'mr-8 bg-muted'
              )}>
              <MarkdownBlock content={msg.content} />
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-3 border-t border-border/50 pt-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    {t('rag.sources')}
                  </div>
                  <ul className="mt-1 space-y-1">
                    {msg.sources.map((s, j) => (
                      <li key={j} className="flex items-start gap-1 text-xs">
                        <FileText className="mt-0.5 size-3 shrink-0" />
                        <span>{s.paper_title ?? s.content ?? '—'}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
          {queryMutation.isPending && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t('rag.thinking')}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex gap-2 border-t border-border p-4">
          <input
            type="text"
            placeholder={t('rag.askPlaceholder')}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={queryMutation.isPending || !hasIndex}
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={queryMutation.isPending || !question.trim() || !hasIndex}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            <Send className="size-4" />
            {t('rag.send')}
          </button>
        </form>
      </div>
    </div>
  );
}
