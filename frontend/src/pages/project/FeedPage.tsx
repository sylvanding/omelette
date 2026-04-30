import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Loader2,
  RefreshCw,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { feedApi } from '@/services/api';

interface PaperFeedback {
  paperId: number;
  feedback: 'like' | 'dislike' | null;
}

export default function FeedPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId);

  const [feedbacks, setFeedbacks] = useState<PaperFeedback[]>([]);
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());

  const { data: feedResponse, isLoading, refetch } = useQuery({
    queryKey: ['feed', pid],
    queryFn: () => feedApi.get(pid),
    enabled: !!pid,
  });

  const refreshMutation = useMutation({
    mutationFn: () => feedApi.refresh(pid),
    onSuccess: () => {
      refetch();
      setFeedbacks([]);
    },
  });

  const feedbackMutation = useMutation({
    mutationFn: ({ paperId, feedback }: { paperId: number; feedback: string }) =>
      feedApi.feedback(pid, paperId, feedback),
  });

  const handleFeedback = useCallback(
    (paperId: number, feedback: 'like' | 'dislike') => {
      feedbackMutation.mutate({ paperId, feedback });
      setFeedbacks((prev) => {
        const existing = prev.findIndex((p) => p.paperId === paperId);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = { paperId, feedback };
          return updated;
        }
        return [...prev, { paperId, feedback }];
      });
    },
    [feedbackMutation],
  );

  const toggleExpand = useCallback((index: number) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const handleRefresh = useCallback(() => {
    refreshMutation.mutate();
  }, [refreshMutation]);

  const scoreColor = (score: number) => {
    if (score >= 0.8) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    if (score >= 0.6) return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
    return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
  };

  const recommendations = feedResponse?.recommendations ?? [];

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Sparkles className="size-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">Research Feed</h2>
            <p className="text-sm text-muted-foreground">
              Personalized paper recommendations based on your library
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshMutation.isPending}>
          {refreshMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          {refreshMutation.isPending ? 'Refreshing...' : 'Refresh Feed'}
          <RefreshCw className="ml-2 size-4" />
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          Generating recommendations...
        </div>
      )}

      {recommendations.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
          <Sparkles className="size-12" />
          <p className="text-sm">No recommendations yet. Add papers to your library to get started.</p>
        </div>
      )}

      {/* Recommendation cards */}
      <div className="space-y-4">
        {recommendations.map((rec, index) => (
          <div
            key={index}
            className="rounded-lg border bg-card p-5"
          >
            {/* Header: title + score */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold">{rec.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {rec.authors}
                  {rec.year ? ` · ${rec.year}` : ''}
                  {rec.doi ? ` · ${rec.doi}` : ''}
                </p>
              </div>
              <Badge className={`shrink-0 ${scoreColor(rec.relevance_score)}`}>
                {Math.round(rec.relevance_score * 100)}%
              </Badge>
            </div>

            {/* Reason */}
            <div className="mt-3 flex items-start gap-2 rounded-md bg-muted/50 p-3">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="text-sm">{rec.reason}</p>
            </div>

            {/* Expandable abstract */}
            <button
              type="button"
              onClick={() => toggleExpand(index)}
              className="mt-3 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              {expandedCards.has(index) ? (
                <ChevronUp className="size-4" />
              ) : (
                <ChevronDown className="size-4" />
              )}
              {expandedCards.has(index) ? 'Hide' : 'Show'} abstract
            </button>

            {expandedCards.has(index) && (
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {rec.abstract}
              </p>
            )}

            {/* Feedback buttons */}
            <div className="mt-4 flex items-center gap-2">
              <Button
                variant={getFeedbackForPaper(feedbacks, rec.title) === 'like' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleFeedback(index, 'like')}
              >
                <ThumbsUp className="mr-1 size-3.5" />
                Relevant
              </Button>
              <Button
                variant={getFeedbackForPaper(feedbacks, rec.title) === 'dislike' ? 'destructive' : 'outline'}
                size="sm"
                onClick={() => handleFeedback(index, 'dislike')}
              >
                <ThumbsDown className="mr-1 size-3.5" />
                Not relevant
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function getFeedbackForPaper(
  feedbacks: PaperFeedback[],
  title: string,
): 'like' | 'dislike' | null {
  const match = feedbacks.find((f) => f.paperId === title.charCodeAt(0) % 1000);
  return match?.feedback ?? null;
}
