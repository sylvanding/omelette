import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { apiUrl } from '@/lib/api-config';
import { useToastMutation } from '@/hooks/use-toast-mutation';
import { writingApi } from '@/services/api';
import { toast } from 'sonner';

interface UseWritingMutationsParams {
  pid: number;
  selectedIds: number[];
  topic: string;
  researchTopic: string;
  citeStyle: string;
  language: string;
  activeTab: string;
  reviewTopic: string;
  reviewStyle: string;
  reviewLang: string;
}

interface UseWritingMutationsReturn {
  output: string;
  reviewStreaming: boolean;
  reviewContent: string;
  reviewCitations: Record<string, { paper_id: number; title: string; number: number }>;
  reviewSections: string[];
  currentSection: string;
  isPending: boolean;
  canRun: boolean;
  runAction: () => void;
  startReviewStream: () => Promise<void>;
  stopReviewStream: () => void;
  copyReviewContent: () => void;
  downloadReview: () => void;
}

export function useWritingMutations(
  params: UseWritingMutationsParams
): UseWritingMutationsReturn {
  const { t } = useTranslation();
  const { pid, selectedIds, topic, researchTopic, citeStyle, language, activeTab, reviewTopic, reviewStyle, reviewLang } = params;

  const [output, setOutput] = useState('');
  const [reviewStreaming, setReviewStreaming] = useState(false);
  const [reviewContent, setReviewContent] = useState('');
  const [reviewCitations, setReviewCitations] = useState<
    Record<string, { paper_id: number; title: string; number: number }>
  >({});
  const [reviewSections, setReviewSections] = useState<string[]>([]);
  const [currentSection, setCurrentSection] = useState('');
  const abortRef = useRef<AbortController | null>(null);

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

  return {
    output,
    reviewStreaming,
    reviewContent,
    reviewCitations,
    reviewSections,
    currentSection,
    isPending,
    canRun,
    runAction,
    startReviewStream,
    stopReviewStream,
    copyReviewContent,
    downloadReview,
  };
}
