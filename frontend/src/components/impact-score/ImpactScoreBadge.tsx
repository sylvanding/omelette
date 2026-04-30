import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { ImpactFactor } from '@/services/api';

interface ImpactScoreBadgeProps {
  score: number;
  factors?: Record<string, ImpactFactor>;
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10';
  if (score >= 60) return 'text-blue-600 dark:text-blue-400 bg-blue-500/10';
  if (score >= 40) return 'text-amber-600 dark:text-amber-400 bg-amber-500/10';
  if (score >= 20) return 'text-orange-600 dark:text-orange-400 bg-orange-500/10';
  return 'text-muted-foreground bg-muted/50';
}

function trendIcon(value: number) {
  if (value > 0.7) return <TrendingUp className="size-3 text-emerald-500" />;
  if (value < 0.3) return <TrendingDown className="size-3 text-red-500" />;
  return <Minus className="size-3 text-muted-foreground" />;
}

const LABELS: Record<string, string> = {
  citations: 'Citations',
  recency: 'Recency',
  journal: 'Journal Prestige',
  evidence_consensus: 'Evidence Consensus',
  field_percentile: 'Field Percentile',
};

export function ImpactScoreBadge({ score, factors }: ImpactScoreBadgeProps) {
  const rounded = Math.round(score);

  const badge = (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${scoreColor(score)}`}>
      {rounded}
    </span>
  );

  if (!factors) return badge;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1 text-xs">
            <p className="font-semibold text-foreground">Impact Score: {rounded}/100</p>
            <div className="space-y-0.5">
              {Object.entries(factors).map(([key, factor]) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    {trendIcon(factor.normalized)}
                    {LABELS[key] ?? key}
                  </span>
                  <span className="tabular-nums">
                    {Math.round(factor.normalized * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
