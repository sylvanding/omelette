import { useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PaperHighlight } from '@/services/api';

const CATEGORY_COLORS: Record<string, { bg: string; border: string; label: string }> = {
  Goal: { bg: 'bg-blue-500/20', border: 'border-blue-500', label: 'Goal' },
  Method: { bg: 'bg-amber-500/20', border: 'border-amber-500', label: 'Method' },
  Result: { bg: 'bg-green-500/20', border: 'border-green-500', label: 'Result' },
};

interface HighlightOverlayProps {
  highlights: PaperHighlight[];
  loading: boolean;
  onRefresh: () => void;
}

export default function HighlightOverlay({ highlights, loading, onRefresh }: HighlightOverlayProps) {
  const [opacity, setOpacity] = useState(60);
  const [activeCategories, setActiveCategories] = useState<Set<string>>(
    new Set(['Goal', 'Method', 'Result']),
  );

  const toggleCategory = useCallback((cat: string) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const filtered = highlights.filter((h) => activeCategories.has(h.category));

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h3 className="text-sm font-medium">AI Highlights</h3>
        <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading} className="h-7 text-xs">
          {loading ? <Loader2 className="size-3 animate-spin" /> : <Eye className="size-3" />}
          Refresh
        </Button>
      </div>

      {/* Category toggles */}
      <div className="flex gap-2 px-3 py-2">
        {Object.keys(CATEGORY_COLORS).map((cat) => {
          const active = activeCategories.has(cat);
          const color = CATEGORY_COLORS[cat];
          return (
            <button
              key={cat}
              type="button"
              onClick={() => toggleCategory(cat)}
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-colors ${
                active
                  ? `${color.bg} ${color.border} border text-foreground`
                  : 'bg-muted/30 text-muted-foreground line-through'
              }`}
            >
              {active ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
              {color.label}
            </button>
          );
        })}
      </div>

      {/* Opacity slider */}
      <div className="flex items-center gap-2 px-3 py-1">
        <span className="text-xs text-muted-foreground">Opacity</span>
        <input
          type="range"
          min={10}
          max={100}
          step={5}
          value={opacity}
          onChange={(e) => setOpacity(Number(e.target.value))}
          className="flex-1 accent-primary"
        />
        <span className="w-8 text-xs text-muted-foreground">{opacity}%</span>
      </div>

      {/* Highlight list */}
      <div className="flex-1 overflow-auto px-3 py-2">
        {filtered.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground">
            No highlights to display
          </p>
        ) : (
          <div className="space-y-2">
            {filtered.map((h, i) => {
              const color = CATEGORY_COLORS[h.category] ?? CATEGORY_COLORS.Result;
              return (
                <div
                  key={i}
                  className={`rounded border-l-2 p-2 text-xs ${color.bg} ${color.border}`}
                  style={{ opacity: opacity / 100 }}
                >
                  <div className="mb-0.5 font-medium">{color.label}</div>
                  <div className="text-muted-foreground">{h.text}</div>
                  <div className="mt-1 text-muted-foreground/60">p. {h.page}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
