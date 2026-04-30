import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { TrendingUp, TrendingDown, BookOpen, Calendar, Tag } from 'lucide-react';
import { trendsApi } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';
import { LoadingState } from '@/components/ui/loading-state';
import PageLayout from '@/components/layout/PageLayout';

function PublicationVolumeChart({ data }: { data: Array<{ year: number; count: number; citations: number }> }) {
  const { t } = useTranslation();

  if (data.length === 0) {
    return <EmptyChart message={t('trends.noVolumeData', 'No publication data available')} />;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="year" tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
        <Tooltip />
        <Bar dataKey="count" fill="#3b82f6" name={t('trends.publications', 'Publications')} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function CitationTimelineChart({ data }: { data: Array<{ year: number; count: number; citations: number }> }) {
  const { t } = useTranslation();

  if (data.length === 0) {
    return <EmptyChart message={t('trends.noCitationData', 'No citation data available')} />;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="year" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        <Legend />
        <Area
          type="monotone"
          dataKey="citations"
          stroke="#8b5cf6"
          fill="#8b5cf6"
          fillOpacity={0.2}
          name={t('trends.citations', 'Citations')}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function TopicTrendLines({ topicTrends }: { topicTrends: Array<{ topic: string; yearly_counts: Array<{ year: number; count: number }>; trend: string }> }) {
  const { t } = useTranslation();

  if (topicTrends.length === 0) {
    return <EmptyChart message={t('trends.noTopicData', 'No topic trend data available')} />;
  }

  // Build unified year data for all topics
  const allYears = new Set<number>();
  topicTrends.forEach((t) => t.yearly_counts.forEach((yc) => allYears.add(yc.year)));
  const sortedYears = Array.from(allYears).sort();

  const chartData = sortedYears.map((year) => {
    const entry: Record<string, number> = { year };
    topicTrends.forEach((tt) => {
      const found = tt.yearly_counts.find((yc) => yc.year === year);
      entry[tt.topic] = found?.count ?? 0;
    });
    return entry;
  });

  const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="year" tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
        <Tooltip />
        <Legend />
        {topicTrends.slice(0, 8).map((tt, i) => (
          <Line
            key={tt.topic}
            type="monotone"
            dataKey={tt.topic}
            stroke={colors[i % colors.length]}
            dot={{ r: 3 }}
            strokeWidth={2}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function EmergingTopicsList({ topics }: { topics: Array<{ topic: string; yoy_growth: number }> }) {
  const { t } = useTranslation();

  if (topics.length === 0) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground justify-center">
        <Tag className="size-4" />
        {t('trends.noEmergingTopics', 'No emerging topics detected')}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {topics.map((item) => (
        <div key={item.topic} className="flex items-center justify-between rounded-lg bg-green-50 px-4 py-2 dark:bg-green-900/20">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4 text-green-600 dark:text-green-400" />
            <span className="text-sm font-medium">{item.topic}</span>
          </div>
          <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/40 dark:text-green-400">
            +{(item.yoy_growth * 100).toFixed(0)}%
          </span>
        </div>
      ))}
    </div>
  );
}

function DecliningTopicsList({ topics }: { topics: Array<{ topic: string; yoy_growth: number }> }) {
  const { t } = useTranslation();

  if (topics.length === 0) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground justify-center">
        <Tag className="size-4" />
        {t('trends.noDecliningTopics', 'No declining topics detected')}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {topics.map((item) => (
        <div key={item.topic} className="flex items-center justify-between rounded-lg bg-red-50 px-4 py-2 dark:bg-red-900/20">
          <div className="flex items-center gap-2">
            <TrendingDown className="size-4 text-red-600 dark:text-red-400" />
            <span className="text-sm font-medium">{item.topic}</span>
          </div>
          <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-400">
            {(item.yoy_growth * 100).toFixed(0)}%
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

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}

export default function TrendsPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId!);

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.trends.all(pid),
    queryFn: () => trendsApi.get(pid),
  });

  if (isLoading) {
    return (
      <PageLayout title={t('trends.title')}>
        <LoadingState />
      </PageLayout>
    );
  }

  if (isError || !data) {
    return (
      <PageLayout title={t('trends.title')}>
        <div className="py-12 text-center text-muted-foreground">
          {t('trends.loadFailed', 'Failed to load trend analysis data')}
        </div>
      </PageLayout>
    );
  }

  const stats = data.summary_stats;

  return (
    <PageLayout title={t('trends.title')}>
      <div className="space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <SummaryCard icon={BookOpen} label={t('trends.totalPapers', 'Total Papers')} value={stats.total_papers} />
          <SummaryCard icon={Calendar} label={t('trends.yearSpan', 'Year Span')} value={stats.year_span > 0 ? `${stats.first_year}–${stats.last_year}` : '—'} />
          <SummaryCard icon={TrendingUp} label={t('trends.emergingTopics', 'Emerging')} value={stats.emerging_count} color="text-green-500" />
          <SummaryCard icon={TrendingDown} label={t('trends.decliningTopics', 'Declining')} value={stats.declining_count} color="text-red-500" />
        </div>

        {/* Publication volume and citations */}
        <div className="grid gap-6 md:grid-cols-2">
          <ChartCard title={t('trends.publicationVolume', 'Publication Volume')}>
            <PublicationVolumeChart data={data.publication_timeline} />
          </ChartCard>
          <ChartCard title={t('trends.citationsOverTime', 'Citations Over Time')}>
            <CitationTimelineChart data={data.publication_timeline} />
          </ChartCard>
        </div>

        {/* Topic trends */}
        <ChartCard title={t('trends.topicTrends', 'Topic Trends')}>
          <TopicTrendLines topicTrends={data.topic_trends} />
        </ChartCard>

        {/* Emerging and declining */}
        <div className="grid gap-6 md:grid-cols-2">
          <ChartCard title={t('trends.emergingTopicsTitle', 'Emerging Topics')}>
            <EmergingTopicsList topics={data.emerging_topics} />
          </ChartCard>
          <ChartCard title={t('trends.decliningTopicsTitle', 'Declining Topics')}>
            <DecliningTopicsList topics={data.declining_topics} />
          </ChartCard>
        </div>
      </div>
    </PageLayout>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  color = 'text-foreground',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  color?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </div>
      <div className={`mt-1 text-2xl font-bold ${typeof value === 'number' ? color : ''}`}>{value}</div>
    </div>
  );
}
