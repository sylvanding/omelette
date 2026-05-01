import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { projectApi, type OverviewData } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';
import {
  FileText,
  BookOpen,
  CheckCircle2,
  Clock,
  Star,
  Tag,
  Bell,
} from 'lucide-react';

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className={`flex size-10 items-center justify-center rounded-lg ${color}`}>
          <Icon className="size-5" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ReadingProgressBar({
  data,
}: {
  data: OverviewData;
}) {
  const total = data.total_papers || 1;
  const completed = data.papers_by_reading['completed'] || 0;
  const reading = data.papers_by_reading['reading'] || 0;
  const unread = data.papers_by_reading['unread'] || 0;

  const completedPct = Math.round((completed / total) * 100);
  const readingPct = Math.round((reading / total) * 100);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Reading Progress</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-2 flex h-3 overflow-hidden rounded-full bg-muted">
          {completedPct > 0 && (
            <div
              className="bg-emerald-500 transition-all"
              style={{ width: `${completedPct}%` }}
              title={`Completed: ${completed}`}
            />
          )}
          {readingPct > 0 && (
            <div
              className="bg-amber-500 transition-all"
              style={{ width: `${readingPct}%` }}
              title={`Reading: ${reading}`}
            />
          )}
          {unread > 0 && (
            <div
              className="bg-muted-foreground/20 transition-all"
              style={{ width: `${100 - completedPct - readingPct}%` }}
              title={`Unread: ${unread}`}
            />
          )}
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-emerald-500" />
            Completed ({completed})
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-amber-500" />
            Reading ({reading})
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-muted-foreground/20" />
            Unread ({unread})
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function YearChart({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).sort(([a], [b]) => Number(a) - Number(b));
  const maxVal = Math.max(...entries.map(([, v]) => v), 1);

  if (entries.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Papers by Year</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No year data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Papers by Year</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-1" style={{ height: '120px' }}>
          {entries.map(([year, count]) => (
            <div key={year} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-xs font-medium">{count}</span>
              <div
                className="w-full rounded-t bg-primary/80 transition-all hover:bg-primary"
                style={{ height: `${Math.max((count / maxVal) * 80, 4)}px` }}
                title={`${year}: ${count} papers`}
              />
              <span className="text-xs text-muted-foreground">{year.slice(2)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function OverviewPage() {
  const { projectId } = useParams<{ projectId: string }>();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.projects.overview(Number(projectId)),
    queryFn: () => projectApi.getOverview(Number(projectId!)),
    enabled: !!projectId,
  });

  if (isLoading || !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading overview...</p>
      </div>
    );
  }

  const d = data as OverviewData;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="text-sm text-muted-foreground">Project dashboard and key metrics</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard icon={FileText} label="Total Papers" value={d.total_papers} color="bg-blue-100 text-blue-700" />
        <StatCard icon={BookOpen} label="Avg Citations" value={d.avg_citations} color="bg-purple-100 text-purple-700" />
        <StatCard icon={Tag} label="Keywords" value={d.keyword_count} color="bg-amber-100 text-amber-700" />
        <StatCard icon={Bell} label="Subscriptions" value={d.subscription_count} color="bg-emerald-100 text-emerald-700" />
      </div>

      {/* Reading Progress + Year Chart */}
      <div className="grid gap-4 md:grid-cols-2">
        <ReadingProgressBar data={d} />
        <YearChart data={d.papers_by_year} />
      </div>

      {/* Recent Papers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Recently Added</CardTitle>
        </CardHeader>
        <CardContent>
          {d.recent_papers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No papers yet. Upload papers or search databases to get started.</p>
          ) : (
            <div className="space-y-3">
              {d.recent_papers.map((paper, i) => (
                <div key={i} className="flex items-start gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
                  <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{paper.title}</p>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      {paper.year && <span>{paper.year}</span>}
                      <span className="flex items-center gap-1">
                        {paper.reading_status === 'completed' && <CheckCircle2 className="size-3 text-emerald-500" />}
                        {paper.reading_status === 'reading' && <Clock className="size-3 text-amber-500" />}
                        {paper.reading_status === 'unread' && <Star className="size-3 text-muted-foreground" />}
                        {paper.reading_status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
