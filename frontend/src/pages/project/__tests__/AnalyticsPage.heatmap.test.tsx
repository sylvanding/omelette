import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AnalyticsPage from '@/pages/project/AnalyticsPage';
import { vi } from 'vitest';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

vi.mock('@/services/api', () => ({
  paperApi: {
    getAnalytics: vi.fn().mockResolvedValue({
      total: 5,
      by_status: { unread: 2, reading: 1, read: 2, archived: 0 },
      read_by_week: { '2024-10': 1, '2024-11': 1 },
      read_by_day: { '2024-10-15': 1, '2024-11-03': 1 },
      top_journals: [{ journal: 'Nature', count: 3 }],
      papers_per_week: 2,
      avg_read_time_seconds: 3600,
      reading_streak_days: 3,
      domain_coverage: 0.75,
      citation_impact: { min: 5, max: 100, mean: 30, median: 25, p75: 50 },
    }),
  },
  knowledgeGapsApi: {
    get: vi.fn().mockResolvedValue({ gaps: [] }),
  },
}));

function renderWithProviders() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/projects/1/analytics']}>
        <Routes>
          <Route path="/projects/:projectId/analytics" element={<AnalyticsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AnalyticsPage Heatmap', () => {
  test('renders reading activity section', async () => {
    renderWithProviders();
    expect(await screen.findByText('Reading Activity')).toBeInTheDocument();
  });
});
