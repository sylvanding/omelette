import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquare, BookOpen, FileSearch, GitCompare, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { ToolMode } from '@/types/chat';

interface ToolModeSelectorProps {
  value: ToolMode;
  onChange: (mode: ToolMode) => void;
}

const modes: { value: ToolMode; labelKey: string; descKey: string; icon: typeof MessageSquare }[] = [
  { value: 'qa', labelKey: 'playground.toolMode.qa', descKey: 'playground.toolMode.qaDesc', icon: MessageSquare },
  { value: 'citation_lookup', labelKey: 'playground.toolMode.citation_lookup', descKey: 'playground.toolMode.citation_lookupDesc', icon: BookOpen },
  { value: 'review_outline', labelKey: 'playground.toolMode.review_outline', descKey: 'playground.toolMode.review_outlineDesc', icon: FileSearch },
  { value: 'gap_analysis', labelKey: 'playground.toolMode.gap_analysis', descKey: 'playground.toolMode.gap_analysisDesc', icon: GitCompare },
];

export default function ToolModeSelector({ value, onChange }: ToolModeSelectorProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = modes.find((m) => m.value === value) ?? modes[0];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            'bg-muted text-foreground hover:bg-muted/80',
          )}
        >
          <current.icon className="size-3.5" />
          {t(current.labelKey)}
          <ChevronDown className={cn('size-3 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-1" align="start" sideOffset={6}>
        {modes.map((mode) => (
          <button
            key={mode.value}
            onClick={() => {
              onChange(mode.value);
              setOpen(false);
            }}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors',
              value === mode.value ? 'bg-accent' : 'hover:bg-accent/50',
            )}
          >
            <mode.icon className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{t(mode.labelKey)}</div>
              <div className="truncate text-xs text-muted-foreground">{t(mode.descKey)}</div>
            </div>
            {value === mode.value && <Check className="size-4 shrink-0 text-primary" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
