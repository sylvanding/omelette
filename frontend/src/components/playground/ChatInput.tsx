import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, Loader2, Paperclip, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import ToolModeSelector from './ToolModeSelector';
import type { ToolMode } from '@/types/chat';

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
}

export default function ChatInput({
  onSend,
  isLoading,
  disabled,
  placeholder,
  toolMode,
  onToolModeChange,
  selectedKBs,
  onRemoveKB,
}: ChatInputProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || isLoading || disabled) return;
    onSend(trimmed);
    setValue('');
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
          title={t('playground.attach', { defaultValue: 'Attach file' })}
        >
          <Paperclip className="size-5" />
        </button>
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? t('playground.inputPlaceholder')}
          disabled={isLoading || disabled}
          rows={1}
          className="min-h-[48px] max-h-[200px] flex-1 resize-none border-0 bg-transparent px-0 py-3 text-base shadow-none focus-visible:ring-0"
        />
        <div className="shrink-0 p-2">
          <Button
            size="icon"
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
