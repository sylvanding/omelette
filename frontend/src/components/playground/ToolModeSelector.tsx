import { MessageSquare, BookOpen, FileSearch, GitCompare } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ToolMode } from '@/types/chat';

interface ToolModeSelectorProps {
  value: ToolMode;
  onChange: (mode: ToolMode) => void;
}

const modes: { value: ToolMode; label: string; icon: typeof MessageSquare; desc: string }[] = [
  { value: 'qa', label: '问答', icon: MessageSquare, desc: '基于知识库的智能问答' },
  { value: 'citation_lookup', label: '引用查找', icon: BookOpen, desc: '为文本寻找引用来源' },
  { value: 'review_outline', label: '综述大纲', icon: FileSearch, desc: '生成文献综述提纲' },
  { value: 'gap_analysis', label: '研究空白', icon: GitCompare, desc: '分析研究领域空白' },
];

export default function ToolModeSelector({ value, onChange }: ToolModeSelectorProps) {
  return (
    <div className="flex gap-1">
      {modes.map((mode) => (
        <button
          key={mode.value}
          onClick={() => onChange(mode.value)}
          title={mode.desc}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            value === mode.value
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground',
          )}
        >
          <mode.icon className="size-3.5" />
          {mode.label}
        </button>
      ))}
    </div>
  );
}
