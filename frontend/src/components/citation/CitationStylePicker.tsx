import { cn } from '@/lib/utils';
import { CITATION_STYLES, type CitationStyle } from './citation-styles';

export type { CitationStyle };

interface CitationStylePickerProps {
  value: CitationStyle;
  onChange: (style: CitationStyle) => void;
  className?: string;
}

export function CitationStylePicker({ value, onChange, className }: CitationStylePickerProps) {
  return (
    <div className={cn('inline-flex rounded-lg border bg-muted p-0.5', className)}>
      {CITATION_STYLES.map(({ value: styleValue, label }) => (
        <button
          key={styleValue}
          className={cn(
            'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            value === styleValue
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => onChange(styleValue)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
