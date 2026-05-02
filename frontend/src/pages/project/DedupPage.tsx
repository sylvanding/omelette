import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Files, GitCompare, Brain, CheckCircle2, XCircle, Loader2,
  AlertCircle, Copy, ShieldAlert, ChevronDown, ChevronUp, Merge,
} from 'lucide-react';
import { dedupApi, paperApi } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';
import { useToastMutation } from '@/hooks/use-toast-mutation';
import { LoadingState } from '@/components/ui/loading-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import PageLayout from '@/components/layout/PageLayout';

type DedupStrategy = 'full' | 'doi_only' | 'title_only';

interface VerifyResult {
  is_duplicate: boolean;
  confidence: number;
  reasoning: string;
}

interface DedupCandidate {
  paper_a: { id: number; title?: string; authors?: string; doi?: string; year?: string | number; journal?: string };
  paper_b: { id: number; title?: string; authors?: string; doi?: string; year?: string | number; journal?: string };
  confidence: number;
  strategy: string;
}

export default function DedupPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId!);
  const [strategy, setStrategy] = useState<DedupStrategy>('full');
  const [verifiedPairs, setVerifiedPairs] = useState<Map<string, VerifyResult>>(new Map());
  const [dismissedPairs, setDismissedPairs] = useState<Set<string>>(new Set());
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  const { data: papersData, isLoading: isLoadingPapers } = useQuery({
    queryKey: queryKeys.papers.list(pid),
    queryFn: () => paperApi.list(pid),
  });

  const { data: candidatesData, isLoading: isLoadingCandidates } = useQuery({
    queryKey: queryKeys.dedup.candidates(pid, { page: 1, page_size: 20 }),
    queryFn: () => dedupApi.candidates(pid, { page: 1, page_size: 20 }),
  });

  const papers = papersData?.items ?? [];
  const candidates = (candidatesData?.items as DedupCandidate[] | undefined) ?? [];
  const visibleCandidates = candidates.filter(
    (c) => !dismissedPairs.has(pairKey(c.paper_a?.id, c.paper_b?.id))
  );

  const runDedupMutation = useToastMutation({
    mutationFn: () => dedupApi.run(pid, strategy),
    successMessage: 'Deduplication scan completed',
    errorMessage: 'Failed to run deduplication',
    invalidateKeys: [
      queryKeys.dedup.candidates(pid),
      queryKeys.dedup.stats(pid),
      queryKeys.papers.list(pid),
    ],
  });

  const verifyMutation = useToastMutation({
    mutationFn: ({ aId, bId }: { aId: number; bId: number }) =>
      dedupApi.verify(pid, aId, bId),
    successMessage: 'Verification complete',
    errorMessage: 'Verification failed',
  });

  const handleVerify = (candidate: DedupCandidate) => {
    const aId = candidate.paper_a?.id;
    const bId = candidate.paper_b?.id;
    if (!aId || !bId) return;

    verifyMutation.mutate(
      { aId, bId },
      {
        onSuccess: (data) => {
          const key = pairKey(aId, bId);
          setVerifiedPairs((prev) => new Map(prev).set(key, {
            is_duplicate: data.is_duplicate as boolean,
            confidence: data.confidence as number,
            reasoning: data.reasoning as string,
          }));
          setExpandedCards((prev) => new Set(prev).add(key));
        },
      },
    );
  };

  const handleDismiss = (candidate: DedupCandidate) => {
    const aId = candidate.paper_a?.id;
    const bId = candidate.paper_b?.id;
    if (!aId || !bId) return;
    setDismissedPairs((prev) => new Set(prev).add(pairKey(aId, bId)));
  };

  const handleMerge = () => {
    alert('Merge requires a backend endpoint — coming soon');
  };

  const totalPapers = papers.length;
  const totalCandidates = candidates.length;
  const pendingReview = visibleCandidates.length;
  const cleanPapers = totalPapers - totalCandidates;

  if (isLoadingPapers || isLoadingCandidates) {
    return (
      <PageLayout title="Deduplication">
        <LoadingState />
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Deduplication" subtitle="Find and resolve duplicate papers in your library">
      <div className="space-y-6">
        {/* Status overview */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatusCard
            icon={Files}
            label="Total Papers"
            value={totalPapers}
            color="text-blue-500"
            description="All papers in project"
          />
          <StatusCard
            icon={Copy}
            label="Duplicates Found"
            value={totalCandidates}
            color="text-red-500"
            description="Potential duplicate pairs"
          />
          <StatusCard
            icon={ShieldAlert}
            label="Pending Review"
            value={pendingReview}
            color="text-amber-500"
            description="Candidates awaiting action"
          />
          <StatusCard
            icon={CheckCircle2}
            label="Clean Papers"
            value={cleanPapers}
            color="text-green-500"
            description="Unique papers (approx.)"
          />
        </div>

        {/* Run dedup panel */}
        <div className="rounded-lg border bg-card p-6">
          <div className="mb-4 flex items-center gap-3">
            <GitCompare className="size-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">Scan for Duplicates</h2>
              <p className="text-sm text-muted-foreground">
                Compare {totalPapers} paper{totalPapers !== 1 ? 's' : ''} for potential duplicates
              </p>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {(['full', 'doi_only', 'title_only'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStrategy(s)}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  strategy === s
                    ? 'bg-primary text-primary-foreground'
                    : 'border bg-card hover:bg-muted/50'
                }`}
              >
                {s === 'full' ? 'Full scan' : s === 'doi_only' ? 'DOI only' : 'Title only'}
              </button>
            ))}
          </div>

          <Button
            onClick={() => runDedupMutation.mutate()}
            disabled={runDedupMutation.isPending || totalPapers === 0}
            className="gap-2"
          >
            {runDedupMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <GitCompare className="size-4" />
                Run Deduplication
              </>
            )}
          </Button>
        </div>

        {/* Results */}
        {runDedupMutation.isSuccess && runDedupMutation.data && (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border bg-card p-4">
              <div className="text-sm text-muted-foreground">Duplicates Found</div>
              <div className="mt-1 text-2xl font-bold text-red-500">
                {(runDedupMutation.data as Record<string, number>).duplicated ?? 0}
              </div>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="text-sm text-muted-foreground">Total Scanned</div>
              <div className="mt-1 text-2xl font-bold">
                {(runDedupMutation.data as Record<string, number>).total_papers ?? 0}
              </div>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="text-sm text-muted-foreground">Strategy</div>
              <div className="mt-1 text-2xl font-bold text-primary">
                {strategy === 'full' ? 'Full' : strategy === 'doi_only' ? 'DOI' : 'Title'}
              </div>
            </div>
          </div>
        )}

        {/* Candidates list */}
        {visibleCandidates.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground">
              Duplicate Candidates ({visibleCandidates.length})
            </h3>
            {visibleCandidates.slice(0, 10).map((candidate, idx) => (
              <CandidateCard
                key={idx}
                candidate={candidate}
                verifiedPairs={verifiedPairs}
                expandedCards={expandedCards}
                onVerify={handleVerify}
                onDismiss={handleDismiss}
                onMerge={handleMerge}
                isVerifying={verifyMutation.isPending}
                onToggleExpand={(key) => {
                  setExpandedCards((prev) => {
                    const next = new Set(prev);
                    if (next.has(key)) {
                      next.delete(key);
                    } else {
                      next.add(key);
                    }
                    return next;
                  });
                }}
              />
            ))}
            {visibleCandidates.length > 10 && (
              <div className="text-center text-xs text-muted-foreground">
                Showing 10 of {visibleCandidates.length} candidates
              </div>
            )}
          </div>
        )}

        {/* Empty states */}
        {totalPapers === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
            <AlertCircle className="size-12" />
            <p className="text-sm">No papers in this project yet.</p>
          </div>
        )}

        {totalPapers > 0 && totalCandidates === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
            <CheckCircle2 className="size-12 text-green-500" />
            <p className="text-sm">No duplicates found. Your library looks clean!</p>
          </div>
        )}
      </div>
    </PageLayout>
  );
}

function pairKey(aId: number | undefined, bId: number | undefined): string {
  return aId != null && bId != null ? `${aId}-${bId}` : '';
}

function CandidateCard({
  candidate,
  verifiedPairs,
  expandedCards,
  onVerify,
  onDismiss,
  onMerge,
  isVerifying,
  onToggleExpand,
}: {
  candidate: DedupCandidate;
  verifiedPairs: Map<string, VerifyResult>;
  expandedCards: Set<string>;
  onVerify: (candidate: DedupCandidate) => void;
  onDismiss: (candidate: DedupCandidate) => void;
  onMerge: () => void;
  isVerifying: boolean;
  onToggleExpand: (key: string) => void;
}) {
  const paperA = candidate.paper_a;
  const paperB = candidate.paper_b;
  const confidence = candidate.confidence ?? 0;
  const aId = paperA?.id;
  const bId = paperB?.id;
  const key = pairKey(aId, bId);
  const verified = verifiedPairs.get(key);
  const isExpanded = expandedCards.has(key);

  const confidenceColor =
    confidence >= 0.90
      ? 'border-red-500 text-red-600'
      : confidence >= 0.75
        ? 'border-amber-500 text-amber-600'
        : 'border-blue-500 text-blue-600';

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      {/* Header: confidence + strategy */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitCompare className="size-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            {candidate.strategy ?? 'unknown'} match
          </span>
        </div>
        <Badge variant="outline" className={confidenceColor}>
          {Math.round(confidence * 100)}% confidence
        </Badge>
      </div>

      {/* Side-by-side papers */}
      <div className="grid gap-3 sm:grid-cols-2">
        <PaperColumn paper={paperA} label="Paper A" />
        <PaperColumn paper={paperB} label="Paper B" />
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => onVerify(candidate)}
          disabled={isVerifying}
        >
          <Brain className="size-3.5" />
          Verify with LLM
        </Button>
        {verified && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => onToggleExpand(key)}
          >
            {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            {isExpanded ? 'Hide' : 'Show'} Result
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-red-500"
          onClick={onMerge}
        >
          <Merge className="size-3.5" />
          Merge
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={() => onDismiss(candidate)}
        >
          <XCircle className="size-3.5" />
          Dismiss
        </Button>
      </div>

      {/* Verified result panel */}
      {verified && isExpanded && (
        <div className="mt-3 rounded-md border bg-muted/30 p-3">
          <div className="mb-1 flex items-center gap-2">
            {verified.is_duplicate ? (
              <CheckCircle2 className="size-4 text-green-500" />
            ) : (
              <XCircle className="size-4 text-red-500" />
            )}
            <span className="text-sm font-medium">
              {verified.is_duplicate ? 'Likely duplicate' : 'Not duplicates'}
            </span>
            <Badge variant="outline" className="ml-auto text-xs">
              {Math.round(verified.confidence * 100)}%
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{verified.reasoning}</p>
        </div>
      )}
    </div>
  );
}

interface PaperInfo {
  id?: number;
  title?: string;
  authors?: string;
  doi?: string;
  year?: string | number;
  journal?: string;
}

function PaperColumn({
  paper,
  label,
}: {
  paper: PaperInfo | undefined;
  label: string;
}) {
  if (!paper) {
    return (
      <div className="rounded-md border p-3 text-sm text-muted-foreground">
        {label}: No data
      </div>
    );
  }

  return (
    <div className="rounded-md border p-3">
      <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
      <p className="truncate text-sm font-medium">{paper.title ?? 'Untitled'}</p>
      <p className="truncate text-xs text-muted-foreground">
        {(paper.authors ?? '').substring(0, 60)}
      </p>
      {paper.doi && (
        <p className="truncate text-xs text-muted-foreground">{paper.doi}</p>
      )}
      <div className="mt-1 flex gap-2 text-xs text-muted-foreground">
        {paper.year && <span>{paper.year}</span>}
        {paper.journal && <span className="truncate">{paper.journal}</span>}
      </div>
    </div>
  );
}

function StatusCard({
  icon: Icon,
  label,
  value,
  color,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  color: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className={`size-4 ${color}`} />
        {label}
      </div>
      <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{description}</div>
    </div>
  );
}
