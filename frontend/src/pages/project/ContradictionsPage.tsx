import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useToastMutation } from '@/hooks/use-toast-mutation';
import {
  AlertTriangle, Zap, Loader2, BookOpen, Tag, ArrowRightLeft,
  MessageSquare, ShieldCheck, ShieldAlert, Shield,
} from 'lucide-react';
import { contradictionsApi, type ContradictionPair } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import PageLayout from '@/components/layout/PageLayout';
import { EmptyState } from '@/components/ui/empty-state';

export default function ContradictionsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const pid = Number(projectId!);

  const { data, refetch } = useQuery({
    queryKey: queryKeys.contradictions.all(pid),
    queryFn: () => contradictionsApi.detect(pid),
    enabled: false,
  });

  const detectMutation = useToastMutation({
    mutationFn: () => contradictionsApi.detect(pid),
    successMessage: 'Contradiction analysis complete',
    errorMessage: 'Failed to run contradiction analysis',
    onSuccess: () => refetch(),
  });

  const dataLoaded = data && !detectMutation.isPending;
  const contradictions = dataLoaded ? data.contradictions : [];
  const topics = dataLoaded ? data.topics : [];
  const total = dataLoaded ? data.total_contradictions : 0;

  const highConfidence = contradictions.filter((c) => c.confidence >= 0.7).length;
  const mediumConfidence = contradictions.filter((c) => c.confidence >= 0.4 && c.confidence < 0.7).length;
  const lowConfidence = contradictions.filter((c) => c.confidence < 0.4).length;

  return (
    <PageLayout title="Contradictions" subtitle="Detect conflicting claims and findings across your papers">
      <div className="space-y-6">
        {/* Run analysis */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Analyze all papers in this project to identify contradictory claims or findings.
          </p>
          <Button
            onClick={() => detectMutation.mutate()}
            disabled={detectMutation.isPending}
            className="gap-2"
          >
            {detectMutation.isPending ? (
              <><Loader2 className="size-4 animate-spin" /> Analyzing...</>
            ) : (
              <><Zap className="size-4" /> Run Analysis</>
            )}
          </Button>
        </div>

        {dataLoaded && (
          <>
            {/* Summary cards */}
            <div className="grid gap-4 sm:grid-cols-4">
              <SummaryCard icon={AlertTriangle} label="Total" value={total} color="text-amber-500" />
              <SummaryCard icon={ShieldAlert} label="High Confidence" value={highConfidence} color="text-red-500" />
              <SummaryCard icon={Shield} label="Medium" value={mediumConfidence} color="text-orange-500" />
              <SummaryCard icon={ShieldCheck} label="Low Confidence" value={lowConfidence} color="text-muted-foreground" />
            </div>

            {/* Topics */}
            {topics.length > 0 && (
              <div className="rounded-lg border bg-card p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <Tag className="size-4" />
                  Topics ({topics.length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {topics.map((topic) => (
                    <Badge key={topic} variant="secondary" className="text-xs">{topic}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Contradictions list */}
            {contradictions.length > 0 ? (
              <div className="space-y-4">
                {contradictions.map((c, i) => (
                  <ContradictionCard
                    key={i}
                    contradiction={c}
                    onPaperClick={(paperId) => navigate(`/projects/${pid}/papers/${paperId}/read`)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={ShieldCheck}
                title="No contradictions found"
                description="All papers in this project appear to have consistent findings."
              />
            )}
          </>
        )}

        {/* Initial empty state */}
        {!dataLoaded && !detectMutation.isPending && (
          <EmptyState
            icon={ArrowRightLeft}
            title="Contradiction Detection"
            description="Click 'Run Analysis' to scan your papers for conflicting claims."
          />
        )}

        {/* Loading state */}
        {detectMutation.isPending && !dataLoaded && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
            <Loader2 className="size-8 animate-spin" />
            <p className="text-sm">Analyzing papers for contradictions...</p>
            <p className="text-xs">This may take a moment depending on the number of papers.</p>
          </div>
        )}
      </div>
    </PageLayout>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className={`size-4 ${color}`} />
        {label}
      </div>
      <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const level = confidence >= 0.7 ? 'high' : confidence >= 0.4 ? 'medium' : 'low';
  const colors = {
    high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    medium: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    low: 'bg-muted text-muted-foreground',
  };

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${colors[level]}`}>
      {pct}% confidence
    </span>
  );
}

function ContradictionCard({
  contradiction,
  onPaperClick,
}: {
  contradiction: ContradictionPair;
  onPaperClick: (paperId: number) => void;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      {/* Claim header */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <MessageSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">{contradiction.claim}</p>
            <Badge variant="outline" className="mt-1 text-xs">{contradiction.topic}</Badge>
          </div>
        </div>
        <ConfidenceBadge confidence={contradiction.confidence} />
      </div>

      {/* Confidence bar */}
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${contradiction.confidence >= 0.7 ? 'bg-red-500' : contradiction.confidence >= 0.4 ? 'bg-orange-500' : 'bg-muted-foreground/30'}`}
          style={{ width: `${contradiction.confidence * 100}%` }}
        />
      </div>

      {/* Paper positions */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border-l-2 border-l-red-400 bg-muted/20 p-3">
          <button
            type="button"
            className="mb-1 flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 hover:underline"
            onClick={() => onPaperClick(contradiction.paper_a_id)}
          >
            <BookOpen className="size-3" />
            {contradiction.paper_a_title || 'Unknown'}
          </button>
          <p className="text-sm">{contradiction.position_a}</p>
        </div>
        <div className="rounded-md border-l-2 border-l-blue-400 bg-muted/20 p-3">
          <button
            type="button"
            className="mb-1 flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
            onClick={() => onPaperClick(contradiction.paper_b_id)}
          >
            <BookOpen className="size-3" />
            {contradiction.paper_b_title || 'Unknown'}
          </button>
          <p className="text-sm">{contradiction.position_b}</p>
        </div>
      </div>
    </div>
  );
}
