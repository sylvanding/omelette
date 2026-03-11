import { useTranslation } from 'react-i18next';
import { MessageSquare, BookOpen, FileSearch, GitCompare } from 'lucide-react';
import { cn } from '@/lib/utils';
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
  return (
    <div className="flex gap-1">
      {modes.map((mode) => (
        <button
          key={mode.value}
          onClick={() => onChange(mode.value)}
          title={t(mode.descKey)}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            value === mode.value
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground',
          )}
        >
          <mode.icon className="size-3.5" />
          {t(mode.labelKey)}
        </button>
      ))}
    </div>
  );
}
