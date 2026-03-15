import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, Loader2, Paperclip, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import ToolModeSelector from './ToolModeSelector';
import CompletionSuggestion from './CompletionSuggestion';
import type { ToolMode } from '@/types/chat';
import { api } from '@/lib/api';

interface KBInfo {
  id: number;
  name: string;
}

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  disabled?: boolean;
  placeholder?: string;
  toolMode?: ToolMode;
  onToolModeChange?: (mode: ToolMode) => void;
  selectedKBs?: KBInfo[];
  onRemoveKB?: (id: number) => void;
  conversationId?: number | null;
}

const COMPLETION_DEBOUNCE_MS = 400;
const COMPLETION_MIN_LENGTH = 10;

export default function ChatInput({
  onSend,
  isLoading,
  disabled,
  placeholder,
  toolMode,
  onToolModeChange,
  selectedKBs,
  onRemoveKB,
  conversationId,
}: ChatInputProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [completion, setCompletion] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clearCompletion = useCallback(() => {
    setCompletion('');
    abortRef.current?.abort();
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const fetchCompletion = useCallback(
    (prefix: string) => {
      clearCompletion();
      if (prefix.trim().length < COMPLETION_MIN_LENGTH || isLoading || disabled) return;

      timerRef.current = setTimeout(async () => {
        const controller = new AbortController();
        abortRef.current = controller;
        try {
          const res = await api.post<{ completion: string; confidence: number }>(
            '/chat/complete',
            {
              prefix,
              conversation_id: conversationId ?? undefined,
              knowledge_base_ids: selectedKBs?.map((kb) => kb.id) ?? [],
            },
            { signal: controller.signal },
          );
          if (!controller.signal.aborted && res.data?.completion) {
            setCompletion(res.data.completion);
          }
        } catch {
          /* aborted or error — silently ignore */
        }
      }, COMPLETION_DEBOUNCE_MS);
    },
    [clearCompletion, conversationId, selectedKBs, isLoading, disabled],
  );

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    setValue(newVal);
    fetchCompletion(newVal);
  };

  const acceptCompletion = () => {
    if (completion) {
      const newVal = value + completion;
      setValue(newVal);
      setCompletion('');
    }
  };

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || isLoading || disabled) return;
    clearCompletion();
    onSend(trimmed);
    setValue('');
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab' && completion) {
      e.preventDefault();
      acceptCompletion();
      return;
    }
    if (e.key === 'Escape' && completion) {
      e.preventDefault();
      clearCompletion();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const hasToolbar = toolMode && onToolModeChange;
  const hasKBChips = selectedKBs && selectedKBs.length > 0;

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm transition-shadow focus-within:shadow-md focus-within:border-primary/30">
      {(hasToolbar || hasKBChips) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border/50 px-3 py-2">
          {hasToolbar && (
            <ToolModeSelector value={toolMode} onChange={onToolModeChange} />
          )}
          {hasKBChips && (
            <div className="flex flex-wrap items-center gap-1">
              {selectedKBs.map((kb) => (
                <Badge key={kb.id} variant="secondary" className="gap-1 pr-1 text-xs">
                  {kb.name}
                  {onRemoveKB && (
                    <button
                      onClick={() => onRemoveKB(kb.id)}
                      className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="relative flex items-end">
        <button
          type="button"
          className="shrink-0 p-3 text-muted-foreground transition-colors hover:text-foreground"
          title={t('playground.attach')}
        >
          <Paperclip className="size-5" />
        </button>
        <div className="relative flex-1">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ?? t('playground.inputPlaceholder')}
            disabled={isLoading || disabled}
            rows={1}
            className="min-h-[48px] max-h-[200px] resize-none border-0 bg-transparent px-0 py-3 text-base shadow-none focus-visible:ring-0"
          />
          {completion && (
            <div className="pointer-events-none absolute bottom-3 left-0 whitespace-pre-wrap text-base">
              <span className="invisible">{value}</span>
              <CompletionSuggestion completion={completion} visible={!!completion} />
            </div>
          )}
        </div>
        <div className="shrink-0 p-2">
          <Button
            size="icon"
            aria-label={t('playground.send')}
            onClick={handleSubmit}
            disabled={!value.trim() || isLoading || disabled}
            className="size-8 rounded-lg"
          >
            {isLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
