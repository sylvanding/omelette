import { renderWithProviders } from '@/test/utils';
import TrendsView from '../TrendsView';

// Mock recharts to avoid SVG rendering complexity in tests
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-chart">{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div data-testid="bar" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  AreaChart: ({ children }: { children: React.ReactNode }) => <div data-testid="area-chart">{children}</div>,
  Area: () => <div data-testid="area" />,
}));

const mockSummaryStats = {
  total_papers: 20,
  year_span: 5,
  first_year: 2020,
  last_year: 2024,
  total_topics: 3,
  emerging_count: 1,
  declining_count: 1,
};

const mockTimeline = [
  { year: 2020, count: 2, citations: 80 },
  { year: 2021, count: 3, citations: 120 },
  { year: 2022, count: 5, citations: 200 },
];

const mockTopicTrends = [
  {
    topic: 'deep learning',
    slope: 0.8,
    r_squared: 0.92,
    trend: 'rising' as const,
    total_papers: 12,
    first_year: 2020,
    last_year: 2024,
    yearly_counts: [{ year: 2020, count: 2 }, { year: 2021, count: 3 }],
  },
];

const mockEmerging = [{ topic: 'transformers', yoy_growth: 0.67 }];
const mockDeclining = [{ topic: 'legacy methods', yoy_growth: -0.5 }];

describe('TrendsView', () => {
  it('renders loading skeleton when isLoading is true', () => {
    const { container } = renderWithProviders(
      <TrendsView
        publicationTimeline={[]}
        topicTrends={[]}
        emergingTopics={[]}
        decliningTopics={[]}
        summaryStats={mockSummaryStats}
        isLoading
      />,
    );
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders error state when error is provided', () => {
    const { getByText } = renderWithProviders(
      <TrendsView
        publicationTimeline={[]}
        topicTrends={[]}
        emergingTopics={[]}
        decliningTopics={[]}
        summaryStats={mockSummaryStats}
        error="Failed to load trends"
      />,
    );
    expect(getByText('Failed to load trends')).toBeTruthy();
  });

  it('renders empty state when no timeline data', () => {
    const { getByText } = renderWithProviders(
      <TrendsView
        publicationTimeline={[]}
        topicTrends={[]}
        emergingTopics={[]}
        decliningTopics={[]}
        summaryStats={mockSummaryStats}
      />,
    );
    expect(
      getByText('No trend data available. Add papers with years to see trends.'),
    ).toBeTruthy();
  });

  it('renders summary stats cards with correct labels', () => {
    const { getByText } = renderWithProviders(
      <TrendsView
        publicationTimeline={mockTimeline}
        topicTrends={mockTopicTrends}
        emergingTopics={mockEmerging}
        decliningTopics={mockDeclining}
        summaryStats={mockSummaryStats}
      />,
    );
    expect(getByText('Total Papers')).toBeTruthy();
    expect(getByText('Year Span')).toBeTruthy();
    expect(getByText('Emerging')).toBeTruthy();
    expect(getByText('Declining')).toBeTruthy();
  });

  it('renders publication volume chart container', () => {
    const { getByTestId } = renderWithProviders(
      <TrendsView
        publicationTimeline={mockTimeline}
        topicTrends={mockTopicTrends}
        emergingTopics={[]}
        decliningTopics={[]}
        summaryStats={mockSummaryStats}
      />,
    );
    expect(getByTestId('bar-chart')).toBeTruthy();
  });

  it('renders topic trends area chart when topics exist', () => {
    const { getByTestId } = renderWithProviders(
      <TrendsView
        publicationTimeline={mockTimeline}
        topicTrends={mockTopicTrends}
        emergingTopics={[]}
        decliningTopics={[]}
        summaryStats={mockSummaryStats}
      />,
    );
    expect(getByTestId('area-chart')).toBeTruthy();
  });

  it('renders emerging and declining topic sections', () => {
    const { getByText } = renderWithProviders(
      <TrendsView
        publicationTimeline={mockTimeline}
        topicTrends={mockTopicTrends}
        emergingTopics={mockEmerging}
        decliningTopics={mockDeclining}
        summaryStats={mockSummaryStats}
      />,
    );
    expect(getByText('Emerging Topics')).toBeTruthy();
    expect(getByText('Declining Topics')).toBeTruthy();
    expect(getByText('transformers')).toBeTruthy();
    expect(getByText('legacy methods')).toBeTruthy();
  });
});
