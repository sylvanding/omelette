import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { apiUrl } from '@/lib/api-config';
import {
  MessageSquare,
  Languages,
  BookOpen,
  Search,
  Send,
  Loader2,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface QAEntry {
  id: string;
  question: string;
  answer: string;
  action?: string;
}

interface SelectionQAProps {
  selectedText: string;
  selectedPage: number;
  paperId: number;
  paperTitle: string;
  projectId: number;
}

const QUICK_ACTIONS = [
  { id: 'explain', icon: MessageSquare, labelKey: 'pdf.explain' as const, fallback: '解释这段话' },
  { id: 'translate', icon: Languages, labelKey: 'pdf.translate' as const, fallback: '翻译' },
  { id: 'find_citations', icon: Search, labelKey: 'pdf.findCitations' as const, fallback: '找相关引用' },
] as const;

export function SelectionQA({
  selectedText,
  selectedPage,
  paperId,
  paperTitle,
}: SelectionQAProps) {
  const { t } = useTranslation();
  const [history, setHistory] = useState<QAEntry[]>([]);
  const [freeQuestion, setFreeQuestion] = useState('');
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);

  const askAI = useCallback(
    async (question: string, action?: string) => {
      if (streaming) return;
      setStreaming(true);

      const entryId = crypto.randomUUID();
      const newEntry: QAEntry = { id: entryId, question, answer: '', action };
      setHistory((prev) => [...prev, newEntry]);

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const message = buildMessage(selectedText, question, action);
        const res = await fetch(apiUrl('/chat/stream'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            knowledge_base_ids: [],
            tool_mode: 'qa',
            paper_id: paperId,
            paper_title: paperTitle,
            selected_text: selectedText,
          }),
          signal: ctrl.signal,
        });

        if (!res.ok || !res.body) {
          setHistory((prev) =>
            prev.map((e) => (e.id === entryId ? { ...e, answer: '请求失败' } : e))
          );
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const textChunks = extractTextFromSSE(buffer);
          if (textChunks) {
            setHistory((prev) =>
              prev.map((e) =>
                e.id === entryId ? { ...e, answer: textChunks } : e
              )
            );
          }
        }

        const finalText = extractTextFromSSE(buffer);
        if (finalText) {
          setHistory((prev) =>
            prev.map((e) =>
              e.id === entryId ? { ...e, answer: finalText } : e
            )
          );
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setHistory((prev) =>
            prev.map((e) => (e.id === entryId ? { ...e, answer: '请求出错' } : e))
          );
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
        setTimeout(() => historyEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    },
    [streaming, selectedText, paperId, paperTitle]
  );

  const handleQuickAction = useCallback(
    (actionId: string, label: string) => {
      if (!selectedText) return;
      askAI(label, actionId);
    },
    [selectedText, askAI]
  );

  const handleFreeQuestion = useCallback(() => {
    if (!freeQuestion.trim()) return;
    askAI(freeQuestion.trim());
    setFreeQuestion('');
  }, [freeQuestion, askAI]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5">
          <BookOpen className="size-4 text-primary" />
          <span className="text-sm font-medium">{t('pdf.aiAssistant', 'AI 助手')}</span>
        </div>
        {history.length > 0 && (
          <Button
            size="icon"
            variant="ghost"
            className="size-6"
            onClick={() => setHistory([])}>
            <Trash2 className="size-3" />
          </Button>
        )}
      </div>

      {/* Selected Text Display */}
      {selectedText && (
        <div className="border-b border-border bg-muted/30 px-3 py-2">
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            {t('pdf.selectedText', '选中文本')} (p.{selectedPage})
          </p>
          <p className="line-clamp-3 text-xs">{selectedText}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {QUICK_ACTIONS.map((action) => (
              <Button
                key={action.id}
                size="sm"
                variant="outline"
                disabled={streaming}
                onClick={() => handleQuickAction(action.id, t(action.labelKey, action.fallback))}
                className="h-7 gap-1 text-xs">
                <action.icon className="size-3" />
                {t(action.labelKey, action.fallback)}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* QA History */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {history.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-center text-xs text-muted-foreground">
              {t('pdf.selectToAsk', '选中 PDF 中的文本，向 AI 提问')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((entry) => (
              <div key={entry.id} className="space-y-1.5">
                <div className="flex items-start gap-1.5">
                  <div className="mt-0.5 size-5 shrink-0 rounded-full bg-primary/10 text-center text-xs leading-5 text-primary">
                    Q
                  </div>
                  <p className="text-xs">{entry.question}</p>
                </div>
                <div className="flex items-start gap-1.5">
                  <div className="mt-0.5 size-5 shrink-0 rounded-full bg-muted text-center text-xs leading-5">
                    A
                  </div>
                  {entry.answer ? (
                    <div className="prose prose-xs dark:prose-invert max-w-none whitespace-pre-wrap text-xs">
                      {entry.answer}
                    </div>
                  ) : (
                    <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>
            ))}
            <div ref={historyEndRef} />
          </div>
        )}
      </div>

      {/* Free Question Input */}
      <div className="border-t border-border p-2">
        <div className="flex gap-1.5">
          <input
            type="text"
            value={freeQuestion}
            onChange={(e) => setFreeQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleFreeQuestion();
              }
            }}
            placeholder={t('pdf.askPlaceholder', '自由提问...')}
            disabled={streaming}
            className={cn(
              'flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs',
              'focus:outline-none focus:ring-1 focus:ring-ring',
              'disabled:opacity-50'
            )}
          />
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            disabled={streaming || !freeQuestion.trim()}
            onClick={handleFreeQuestion}>
            {streaming ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Send className="size-3.5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function buildMessage(selectedText: string, question: string, action?: string): string {
  const context = selectedText
    ? `[选中文本] ${selectedText}\n\n`
    : '';

  if (action === 'explain') {
    return `${context}请解释以下文本的含义和学术意义：\n${selectedText}`;
  }
  if (action === 'translate') {
    const hasChineseChars = /[\u4e00-\u9fff]/.test(selectedText);
    const targetLang = hasChineseChars ? 'English' : '中文';
    return `${context}请将以下文本翻译为${targetLang}：\n${selectedText}`;
  }
  if (action === 'find_citations') {
    return `${context}请在知识库中找到与以下内容相关的文献引用：\n${selectedText}`;
  }
  return `${context}${question}`;
}

function extractTextFromSSE(buffer: string): string {
  let text = '';
  for (const line of buffer.split('\n')) {
    if (!line.startsWith('0:')) continue;
    try {
      const content = JSON.parse(line.slice(2));
      if (typeof content === 'string') {
        text += content;
      }
    } catch {
      /* skip malformed */
    }
  }
  return text;
}
