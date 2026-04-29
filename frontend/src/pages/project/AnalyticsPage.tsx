import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { paperApi } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';
import { LoadingState } from '@/components/ui/loading-state';
import PageLayout from '@/components/layout/PageLayout';

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

        {/* Charts */}
        <div className="grid gap-6 md:grid-cols-2">
          <ChartCard title={t('analytics.readingProgress')}>
            <ReadingStatusPie data={byStatus} />
          </ChartCard>
          <ChartCard title={t('analytics.weeklyReads')}>
            <WeeklyReadBar data={readByWeek} />
          </ChartCard>
        </div>

        <ChartCard title={t('analytics.topJournals')}>
          <TopJournalsList data={topJournals} />
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
