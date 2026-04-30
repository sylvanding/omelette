import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, TrendingUp, TrendingDown, Download } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type {
  TrendPublicationEntry,
  TrendTopicTrend,
  TrendEmergingTopic,
  TrendSummaryStats,
} from '@/services/api';

interface TrendsViewProps {
  publicationTimeline: TrendPublicationEntry[];
  topicTrends: TrendTopicTrend[];
  emergingTopics: TrendEmergingTopic[];
  decliningTopics: TrendEmergingTopic[];
  summaryStats: TrendSummaryStats;
  isLoading?: boolean;
  error?: string | null;
}

function LoadingSkeleton() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
    </div>
  );
}

const TOPIC_COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4',
  '#84cc16', '#a855f7', '#e11d48', '#0ea5e9', '#d946ef',
];

export default function TrendsView({
  publicationTimeline,
  topicTrends,
  emergingTopics,
  decliningTopics,
  summaryStats,
  isLoading,
  error,
}: TrendsViewProps) {
  const { t } = useTranslation();
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);

  const handleExportCSV = () => {
    const rows = [
      ['Year', 'Publications', 'Citations'],
      ...publicationTimeline.map(e => [e.year, e.count, e.citations]),
      [],
      ['Topic Trends'],
      ['Topic', 'Trend', 'Total Papers', 'Slope', 'R-squared'],
      ...topicTrends.map(t => [t.topic, t.trend, t.total_papers, t.slope, t.r_squared]),
      [],
      ['Emerging Topics'],
      ['Topic', 'YoY Growth'],
      ...emergingTopics.map(t => [t.topic, `${(t.yoy_growth * 100).toFixed(1)}%`]),
      [],
      ['Declining Topics'],
      ['Topic', 'YoY Growth'],
      ...decliningTopics.map(t => [t.topic, `${(t.yoy_growth * 100).toFixed(1)}%`]),
    ];
    const csv = rows.map(row => row.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'research-trends.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <p>{error}</p>
      </div>
    );
  }

  if (!publicationTimeline.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <TrendingUp className="size-12 opacity-30" />
        <p>{t('trends.empty', 'No trend data available. Add papers with years to see trends.')}</p>
      </div>
    );
  }

  const displayTopics = selectedTopic
    ? topicTrends.filter(t => t.topic === selectedTopic)
    : topicTrends.slice(0, 5);

  // Build combined dataset for topic comparison
  const allYears = [...new Set(displayTopics.flatMap(t => t.yearly_counts.map(yc => yc.year)))].sort();
  const topicComparisonData = allYears.map(year => {
    const entry: Record<string, string | number> = { year };
    for (const topic of displayTopics) {
      const yc = topic.yearly_counts.find(c => c.year === year);
      entry[topic.topic] = yc?.count ?? 0;
    }
    return entry;
  });

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-muted-foreground">{t('trends.totalPapers', 'Total Papers')}</div>
          <div className="text-xl font-bold">{summaryStats.total_papers}</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-muted-foreground">{t('trends.yearSpan', 'Year Span')}</div>
          <div className="text-xl font-bold">
            {summaryStats.first_year}–{summaryStats.last_year}
          </div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <TrendingUp className="size-3 text-emerald-500" />
            {t('trends.emerging', 'Emerging')}
          </div>
          <div className="text-xl font-bold text-emerald-500">{summaryStats.emerging_count}</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <TrendingDown className="size-3 text-red-500" />
            {t('trends.declining', 'Declining')}
          </div>
          <div className="text-xl font-bold text-red-500">{summaryStats.declining_count}</div>
        </div>
      </div>

      {/* Export button */}
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={handleExportCSV} className="text-xs">
          <Download className="mr-1 size-3" />
          {t('trends.exportCsv', 'Export CSV')}
        </Button>
      </div>

      {/* Publication volume chart */}
      <div className="rounded-lg border border-border p-4">
        <h3 className="mb-3 text-sm font-semibold">{t('trends.publicationVolume', 'Publication Volume')}</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={publicationTimeline}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="year" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="count" name={t('trends.papers', 'Papers')} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            <Bar dataKey="citations" name={t('trends.citations', 'Citations')} fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Topic trends */}
      {topicTrends.length > 0 && (
        <div className="rounded-lg border border-border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t('trends.topicTrends', 'Topic Trends')}</h3>
            <div className="flex flex-wrap gap-1">
              {topicTrends.slice(0, 8).map((topic, i) => (
                <button
                  key={topic.topic}
                  onClick={() => setSelectedTopic(selectedTopic === topic.topic ? null : topic.topic)}
                  className={`rounded px-2 py-0.5 text-xs transition-colors ${
                    selectedTopic === topic.topic
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted hover:bg-muted/80'
                  }`}
                >
                  <span
                    className="mr-1 inline-block size-2 rounded-full"
                    style={{ backgroundColor: TOPIC_COLORS[i % TOPIC_COLORS.length] }}
                  />
                  {topic.topic}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={topicComparisonData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="year" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              {displayTopics.map((topic, i) => (
                <Area
                  key={topic.topic}
                  type="monotone"
                  dataKey={topic.topic}
                  stroke={TOPIC_COLORS[i % TOPIC_COLORS.length]}
                  fill={TOPIC_COLORS[i % TOPIC_COLORS.length]}
                  fillOpacity={0.15}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Emerging and declining topics */}
      {(emergingTopics.length > 0 || decliningTopics.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {emergingTopics.length > 0 && (
            <div className="rounded-lg border border-emerald-200 p-4">
              <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold text-emerald-600">
                <TrendingUp className="size-4" />
                {t('trends.emergingTopics', 'Emerging Topics')}
              </h3>
              <div className="space-y-1">
                {emergingTopics.map(topic => (
                  <div key={topic.topic} className="flex items-center justify-between text-sm">
                    <span>{topic.topic}</span>
                    <Badge variant="default" className="bg-emerald-500 text-xs">
                      +{(topic.yoy_growth * 100).toFixed(0)}%
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
          {decliningTopics.length > 0 && (
            <div className="rounded-lg border border-red-200 p-4">
              <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold text-red-600">
                <TrendingDown className="size-4" />
                {t('trends.decliningTopics', 'Declining Topics')}
              </h3>
              <div className="space-y-1">
                {decliningTopics.map(topic => (
                  <div key={topic.topic} className="flex items-center justify-between text-sm">
                    <span>{topic.topic}</span>
                    <Badge variant="default" className="bg-red-500 text-xs">
                      {(topic.yoy_growth * 100).toFixed(0)}%
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
