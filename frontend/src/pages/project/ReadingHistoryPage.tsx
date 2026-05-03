import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BookOpen, Clock, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { readingSessionApi } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import PageLayout from '@/components/layout/PageLayout';
import { formatReadingTime } from '@/hooks/useReadingTimer';
import { ReadingGoalsCard } from '@/components/reading/ReadingGoalsCard';

const PAGE_SIZE = 20;

export default function ReadingHistoryPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId!);
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.readingSessions.all(pid),
    queryFn: () => readingSessionApi.list(pid, undefined, page, PAGE_SIZE),
  });

  const sessions = data?.items ?? [];
  const totalPages = data?.total_pages ?? 1;

  if (isLoading) {
    return (
      <PageLayout title={t('readingHistory.title', 'Reading History')}>
        <LoadingState />
      </PageLayout>
    );
  }

  if (isError) {
    return (
      <PageLayout title={t('readingHistory.title', 'Reading History')}>
        <div className="py-12 text-center text-muted-foreground">
          {t('common.error', 'An error occurred')}
        </div>
      </PageLayout>
    );
  }

  // Group sessions by date
  const grouped = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const date = new Date(s.started_at).toLocaleDateString();
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date)!.push(s);
  }

  const totalSeconds = sessions.reduce((sum, s) => sum + s.time_spent_seconds, 0);

  return (
    <PageLayout title={t('readingHistory.title', 'Reading History')} subtitle={t('readingHistory.subtitle', 'Track your reading progress across all papers')}>
      <div className="space-y-6">
        {/* Summary card */}
        <div className="grid gap-4 sm:grid-cols-3">
          <SummaryCard icon={BookOpen} label={t('readingHistory.sessions', 'Sessions')} value={data?.total ?? 0} />
          <SummaryCard icon={Clock} label={t('readingHistory.totalTime', 'Total Time')} value={formatReadingTime(totalSeconds)} />
          <SummaryCard icon={FileText} label={t('readingHistory.papersRead', 'Papers Read')} value={new Set(sessions.map((s) => s.paper_id)).size} />
        </div>

        {/* Reading goals */}
        <ReadingGoalsCard sessions={sessions} />

        {/* Sessions list */}
        {grouped.size === 0 ? (
          <EmptyState
            icon={BookOpen}
            title={t('readingHistory.emptyTitle', 'No reading sessions yet')}
            description={t('readingHistory.emptyDesc', 'Start reading papers to track your progress here.')}
          />
        ) : (
          <div className="space-y-6">
            {Array.from(grouped.entries()).map(([date, daySessions]) => (
              <div key={date}>
                <h3 className="mb-3 text-sm font-medium text-muted-foreground">{formatDate(date)}</h3>
                <div className="space-y-2">
                  {daySessions.map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => navigate(`/projects/${pid}/papers/${session.paper_id}/read`)}
                      className="flex w-full items-center gap-4 rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-accent/50"
                    >
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <BookOpen className="size-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{session.paper_title}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(session.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {session.pages_read != null && ` · ${session.pages_read} page${session.pages_read !== 1 ? 's' : ''}`}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-medium text-muted-foreground">
                        {formatReadingTime(session.time_spent_seconds)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex items-center gap-1 rounded-md border bg-card px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  <ChevronLeft className="size-4" />
                  {t('common.previousPage', 'Previous')}
                </button>
                <span className="text-sm text-muted-foreground">
                  {t('common.pageOf', 'Page {{page}} of {{total}}', { page, total: totalPages })}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex items-center gap-1 rounded-md border bg-card px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  {t('common.nextPage', 'Next')}
                  <ChevronRight className="size-4" />
                </button>
              </div>
            )}
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
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (date.toLocaleDateString() === today.toLocaleDateString()) return 'Today';
  if (date.toLocaleDateString() === yesterday.toLocaleDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}
