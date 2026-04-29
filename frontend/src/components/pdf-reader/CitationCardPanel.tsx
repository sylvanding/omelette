import { useState } from 'react';
import { BookOpen, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CitationCard, TermDefinition } from '@/services/api';

interface CitationCardPanelProps {
  cards: CitationCard[];
  definitions: TermDefinition[];
  loading: boolean;
  onRefresh: () => void;
}

export default function CitationCardPanel({
  cards,
  definitions,
  loading,
  onRefresh,
}: CitationCardPanelProps) {
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const [activeSection, setActiveSection] = useState<'citations' | 'definitions'>('citations');

  const toggleCard = (idx: number) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h3 className="text-sm font-medium">Citations & Terms</h3>
        <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading} className="h-7 text-xs">
          {loading ? <Loader2 className="size-3 animate-spin" /> : <BookOpen className="size-3" />}
          Refresh
        </Button>
      </div>

      {/* Section tabs */}
      <div className="flex border-b border-border">
        <button
          type="button"
          onClick={() => setActiveSection('citations')}
          className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
            activeSection === 'citations'
              ? 'border-b-2 border-primary text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Citations ({cards.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('definitions')}
          className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
            activeSection === 'definitions'
              ? 'border-b-2 border-primary text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Terms ({definitions.length})
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-3 py-2">
        {activeSection === 'citations' ? (
          cards.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground">No citation cards available</p>
          ) : (
            <div className="space-y-2">
              {cards.map((card, i) => (
                <div
                  key={i}
                  className="rounded border border-border bg-card p-2"
                >
                  <button
                    type="button"
                    onClick={() => toggleCard(i)}
                    className="flex w-full items-start justify-between text-left"
                  >
                    <div className="flex-1">
                      <div className="text-xs font-medium line-clamp-1">{card.paper_title}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{card.tldr}</div>
                    </div>
                    {expandedCards.has(i) ? (
                      <ChevronUp className="ml-1 size-3 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="ml-1 size-3 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                  {expandedCards.has(i) && (
                    <div className="mt-2 border-t border-border pt-2">
                      <p className="text-xs text-muted-foreground">{card.tldr}</p>
                      {card.doi && (
                        <p className="mt-1 text-xs text-muted-foreground/60">DOI: {card.doi}</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        ) : definitions.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground">No definitions available</p>
        ) : (
          <div className="space-y-2">
            {definitions.map((def, i) => (
              <div key={i} className="rounded border border-border bg-card p-2">
                <div className="text-xs font-medium text-primary">{def.term}</div>
                <div className="mt-0.5 text-xs text-foreground">{def.definition}</div>
                {def.context && (
                  <div className="mt-1 text-xs text-muted-foreground/60 italic">{def.context}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
