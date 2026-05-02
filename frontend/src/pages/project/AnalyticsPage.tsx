import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Clock, BookOpen, Flame, BookMarked, BookText } from 'lucide-react';
import { paperApi, knowledgeGapsApi } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';
import { LoadingState } from '@/components/ui/loading-state';
import PageLayout from '@/components/layout/PageLayout';
import { formatReadingTime } from '@/hooks/useReadingTimer';
import { cn } from '@/lib/utils';

const STATUS_COLORS: Record<string, string> = {
  unread: '#94a3b8',
  reading: '#3b82f6',
  read: '#22c55e',
  archived: '#6b7280',
};

interface StatusPieData {
  name: string;
  value: number;
  color: string;
}

function ReadingStatusPie({ data }: { data: Record<string, number> }) {
  const { t } = useTranslation();
  const chartData: StatusPieData[] = Object.entries(data)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => ({
      name: t(`papers.readingStatuses.${status}`),
      value: count,
      color: STATUS_COLORS[status] ?? '#94a3b8',
    }));

  if (chartData.length === 0) {
    return <EmptyChart message={t('analytics.noData')} />;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          outerRadius={90}
          innerRadius={40}
          dataKey="value"
          label={({ name, value }) => `${name}: ${value}`}
        >
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}

function WeeklyReadBar({ data }: { data: Record<string, number> }) {
  const { t } = useTranslation();
  const chartData = Object.entries(data).map(([week, count]) => ({
    week: formatWeekLabel(week),
    count,
  }));

  if (chartData.length === 0) {
    return <EmptyChart message={t('analytics.noReadData')} />;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="week" tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
        <Tooltip />
        <Bar dataKey="count" fill="#22c55e" name={t('analytics.papersRead')} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function TopJournalsList({ data }: { data: Array<{ journal: string; count: number }> }) {
  const { t } = useTranslation();

  if (data.length === 0) {
    return <EmptyChart message={t('analytics.noJournalData')} />;
  }

  return (
    <div className="space-y-2">
      {data.map((item) => (
        <div key={item.journal} className="flex items-center justify-between rounded-lg bg-muted/30 px-4 py-2">
          <span className="truncate text-sm font-medium">{item.journal}</span>
          <span className="ml-4 shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
            {item.count}
          </span>
        </div>
      ))}
    </div>
  );
}

function ProductivityCards({ data }: { data: ReturnType<typeof paperApi.getAnalytics> extends Promise<infer T> ? Awaited<T> : never }) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <BookOpen className="size-4" />
          {t('analytics.papersPerWeek', 'Papers per Week')}
        </div>
        <div className="mt-1 text-2xl font-bold">{data.papers_per_week ?? 0}</div>
      </div>
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="size-4" />
          {t('analytics.avgReadTime', 'Avg. Read Time')}
        </div>
        <div className="mt-1 text-2xl font-bold">
          {formatReadingTime(Math.round(data.avg_read_time_seconds ?? 0))}
        </div>
      </div>
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Flame className="size-4" />
          {t('analytics.readingStreak', 'Reading Streak')}
        </div>
        <div className="mt-1 text-2xl font-bold">
          {data.reading_streak_days ?? 0} <span className="text-sm font-normal text-muted-foreground">{t('analytics.days', 'days')}</span>
        </div>
      </div>
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <BookMarked className="size-4" />
          {t('analytics.domainCoverage', 'Domain Coverage')}
        </div>
        <div className="mt-1 text-2xl font-bold">
          {Math.round((data.domain_coverage ?? 0) * 100)}%
        </div>
      </div>
    </div>
  );
}

function CitationImpactChart({ data }: { data: { min: number; max: number; mean: number; median: number; p75: number } }) {
  const { t } = useTranslation();

  if (data.max === 0 && data.min === 0) {
    return <EmptyChart message={t('analytics.noData')} />;
  }

  const chartData = [
    { name: 'Min', value: data.min },
    { name: 'Mean', value: data.mean },
    { name: 'Median', value: data.median },
    { name: 'P75', value: data.p75 },
    { name: 'Max', value: data.max },
  ];

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} domain={[0, 'auto']} />
        <Tooltip />
        <Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function KnowledgeGapList({ projectId }: { projectId: number }) {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.analytics.knowledgeGaps(projectId),
    queryFn: () => knowledgeGapsApi.get(projectId),
  });

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">{t('analytics.loading', 'Loading...')}</div>;
  }

  if (!data || data.gaps.length === 0) {
    return (
      <div className="flex items-center gap-2 py-8 text-center text-sm text-muted-foreground justify-center">
        <BookText className="size-4" />
        {t('analytics.knowledgeGapsEmpty', 'Extract concepts first to identify knowledge gaps')}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {data.gaps.map((gap) => (
        <div key={gap.topic} className="flex items-center justify-between rounded-lg bg-muted/30 px-4 py-2">
          <span className="truncate text-sm font-medium">{gap.topic}</span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{gap.paper_count} papers</span>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              {(gap.relevance_score * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

const HEATMAP_LEVELS = [
  { max: 0, color: 'bg-muted/30' },
  { max: 1, color: 'bg-green-200 dark:bg-green-900/40' },
  { max: 3, color: 'bg-green-300 dark:bg-green-800/50' },
  { max: 5, color: 'bg-green-500 dark:bg-green-700/60' },
  { max: Infinity, color: 'bg-green-700 dark:bg-green-500/70' },
];

function getHeatmapColor(count: number): string {
  for (const level of HEATMAP_LEVELS) {
    if (count <= level.max) return level.color;
  }
  return HEATMAP_LEVELS[HEATMAP_LEVELS.length - 1].color;
}

function HeatmapCalendar({ data }: { data: Record<string, number> }) {
  const { t } = useTranslation();

  // Build last 52 weeks of days
  const today = new Date();
  const days: { date: string; count: number }[] = [];
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 364);
  // Align to Sunday
  startDate.setDate(startDate.getDate() - startDate.getDay());

  const currentDate = new Date(startDate);
  while (currentDate <= today) {
    const dateStr = currentDate.toISOString().split('T')[0];
    days.push({ date: dateStr, count: data[dateStr] ?? 0 });
    currentDate.setDate(currentDate.getDate() + 1);
  }

  const totalRead = days.reduce((sum, d) => sum + d.count, 0);

  // Group into weeks (7 days per column)
  const weeks: { date: string; count: number }[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  // Month labels — use year+month to avoid duplicates across years
  const monthLabels: { label: string; weekIndex: number }[] = [];
  let lastKey = '';
  weeks.forEach((week, i) => {
    const d = new Date(week[0].date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (key !== lastKey) {
      monthLabels.push({ label: d.toLocaleString('en', { month: 'short' }), weekIndex: i });
      lastKey = key;
    }
  });

  if (totalRead === 0) {
    return <EmptyChart message={t('analytics.noReadData')} />;
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
        <span>{t('analytics.less', 'Less')}</span>
        {HEATMAP_LEVELS.map((level, i) => (
          <div key={i} className={cn('size-3 rounded-sm', level.color)} />
        ))}
        <span>{t('analytics.more', 'More')}</span>
      </div>
      <div className="relative">
        {/* Month labels */}
        <div className="flex ml-8 mb-1">
          {monthLabels.map((m, idx) => {
            const nextIdx = idx + 1 < monthLabels.length ? monthLabels[idx + 1].weekIndex : weeks.length;
            const span = nextIdx - m.weekIndex;
            const pct = (span / weeks.length) * 100;
            return (
              <div key={m.label + '-' + m.weekIndex} className="text-xs text-muted-foreground" style={{ width: `${pct}%`, minWidth: '2em' }}>
                {m.label}
              </div>
            );
          })}
        </div>
        {/* Heatmap grid */}
        <div className="flex gap-[3px]">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map((day) => (
                <div
                  key={day.date}
                  className={cn('size-3 rounded-sm', getHeatmapColor(day.count))}
                  title={`${day.date}: ${day.count} paper${day.count !== 1 ? 's' : ''}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function formatWeekLabel(week: string): string {
  const [year, weekNum] = week.split('-');
  return `W${weekNum}/${year}`;
}

export default function AnalyticsPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId!);

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.papers.analytics(pid),
    queryFn: () => paperApi.getAnalytics(pid),
  });

  if (isLoading) {
    return (
      <PageLayout title={t('analytics.title')}>
        <LoadingState />
      </PageLayout>
    );
  }

  if (isError || !data) {
    return (
      <PageLayout title={t('analytics.title')}>
        <div className="py-12 text-center text-muted-foreground">
          {t('analytics.loadFailed')}
        </div>
      </PageLayout>
    );
  }

  const total = data.total;
  const byStatus = data.by_status;
  const readByWeek = data.read_by_week;
  const readByDay = data.read_by_day ?? {};
  const topJournals = data.top_journals;

  return (
    <PageLayout title={t('analytics.title')}>
      <div className="space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <SummaryCard label={t('analytics.totalPapers')} value={total} />
          <SummaryCard label={t('papers.readingStatuses.unread')} value={byStatus.unread ?? 0} color="text-slate-400" />
          <SummaryCard label={t('papers.readingStatuses.reading')} value={byStatus.reading ?? 0} color="text-blue-500" />
          <SummaryCard label={t('papers.readingStatuses.read')} value={byStatus.read ?? 0} color="text-green-500" />
        </div>

        {/* Productivity metrics */}
        <ProductivityCards data={data} />

        {/* Charts */}
        <div className="grid gap-6 md:grid-cols-2">
          <ChartCard title={t('analytics.readingProgress')}>
            <ReadingStatusPie data={byStatus} />
          </ChartCard>
          <ChartCard title={t('analytics.weeklyReads')}>
            <WeeklyReadBar data={readByWeek} />
          </ChartCard>
        </div>

        {/* Reading Activity Heatmap */}
        <ChartCard title={t('analytics.readingActivity', 'Reading Activity')}>
          <HeatmapCalendar data={readByDay} />
        </ChartCard>

        {/* Citation impact and domain coverage */}
        <div className="grid gap-6 md:grid-cols-2">
          <ChartCard title={t('analytics.citationImpact', 'Citation Impact')}>
            <CitationImpactChart data={data.citation_impact ?? { min: 0, max: 0, mean: 0, median: 0, p75: 0 }} />
          </ChartCard>
          <ChartCard title={t('analytics.topJournals')}>
            <TopJournalsList data={topJournals} />
          </ChartCard>
        </div>

        {/* Knowledge gaps */}
        <ChartCard title={t('analytics.knowledgeGaps', 'Knowledge Gaps')}>
          <KnowledgeGapList projectId={pid} />
        </ChartCard>
      </div>
    </PageLayout>
  );
}

function SummaryCard({ label, value, color = 'text-foreground' }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}
