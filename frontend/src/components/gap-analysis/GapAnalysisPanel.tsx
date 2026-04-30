import { useTranslation } from 'react-i18next';
import { TrendingUp, Lightbulb, Sparkles, Target } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { GapEntry, GapResearchQuestion } from '@/services/api';

interface GapAnalysisPanelProps {
  gaps: GapEntry[];
  researchQuestions: GapResearchQuestion[];
  totalGaps: number;
  totalQuestions: number;
}

function scoreColor(score: number): string {
  if (score >= 0.75) return 'text-emerald-500';
  if (score >= 0.5) return 'text-amber-500';
  return 'text-muted-foreground';
}

function scoreBg(score: number): string {
  if (score >= 0.75) return 'bg-emerald-500';
  if (score >= 0.5) return 'bg-amber-500';
  return 'bg-muted-foreground';
}

function scoreBar(score: number): string {
  if (score >= 0.75) return 'bg-emerald-500';
  if (score >= 0.5) return 'bg-amber-500';
  return 'bg-muted-foreground';
}

export default function GapAnalysisPanel({
  gaps,
  researchQuestions,
  totalGaps,
  totalQuestions,
}: GapAnalysisPanelProps) {
  const { t } = useTranslation();

  if (!gaps.length && !researchQuestions.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <Lightbulb className="size-12 opacity-30" />
        <p>{t('gaps.empty', 'No gap analysis results. Add papers with abstracts to see research opportunities.')}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <TrendingUp className="size-3" />
            {t('gaps.totalGaps', 'Research Gaps')}
          </div>
          <div className="text-xl font-bold">{totalGaps}</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Sparkles className="size-3" />
            {t('gaps.totalQuestions', 'Research Questions')}
          </div>
          <div className="text-xl font-bold">{totalQuestions}</div>
        </div>
      </div>

      {/* Gap cards */}
      {gaps.length > 0 && (
        <div className="rounded-lg border border-border p-4">
          <h3 className="mb-3 flex items-center gap-1 text-sm font-semibold">
            <Target className="size-4 text-amber-500" />
            {t('gaps.identifiedGaps', 'Identified Research Gaps')}
          </h3>
          <div className="space-y-3">
            {gaps.map(gap => (
              <div key={gap.topic} className="rounded-md border border-border/50 p-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-medium text-sm">{gap.topic}</span>
                  <Badge variant="default" className={`${scoreBg(gap.gap_score)} text-xs text-white`}>
                    {Math.round(gap.gap_score * 100)}%
                  </Badge>
                </div>
                <p className="mb-2 text-xs text-muted-foreground">{gap.description}</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-full bg-muted/50">
                    <div
                      className={`h-1.5 rounded-full ${scoreBar(gap.gap_score)}`}
                      style={{ width: `${gap.gap_score * 100}%` }}
                    />
                  </div>
                  <span className={`text-xs font-medium ${scoreColor(gap.gap_score)}`}>
                    {t('gaps.gapScore', 'Gap Score')}: {gap.gap_score.toFixed(2)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground italic">{gap.evidence}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Research questions */}
      {researchQuestions.length > 0 && (
        <div className="rounded-lg border border-border p-4">
          <h3 className="mb-3 flex items-center gap-1 text-sm font-semibold">
            <Lightbulb className="size-4 text-yellow-500" />
            {t('gaps.researchQuestions', 'Candidate Research Questions')}
          </h3>
          <div className="space-y-3">
            {researchQuestions.map((q, i) => (
              <div key={i} className="rounded-md border border-border/50 p-3">
                <p className="mb-2 font-medium text-sm">{q.question}</p>
                <div className="mb-2 text-xs text-muted-foreground">
                  {t('gaps.addresses', 'Addresses')}: {q.addresses_gap}
                </div>
                <div className="flex gap-4 text-xs">
                  <div className="flex-1">
                    <span className="text-muted-foreground">{t('gaps.novelty', 'Novelty')}:</span>{' '}
                    <span className={scoreColor(q.novelty_score)}>{q.novelty_score.toFixed(2)}</span>
                  </div>
                  <div className="flex-1">
                    <span className="text-muted-foreground">{t('gaps.feasibility', 'Feasibility')}:</span>{' '}
                    <span className={scoreColor(q.feasibility_score)}>{q.feasibility_score.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
