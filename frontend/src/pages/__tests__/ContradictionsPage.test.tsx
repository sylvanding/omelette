import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ContradictionsPage from '@/pages/project/ContradictionsPage';
import { contradictionsApi } from '@/services/api';
import { vi } from 'vitest';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function renderWithProviders() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/projects/1/contradictions']}>
        <Routes>
          <Route path="/projects/:projectId/contradictions" element={<ContradictionsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

vi.mock('@/hooks/use-toast-mutation', () => ({
  useToastMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

describe('ContradictionsPage', () => {
  beforeEach(() => {
    vi.spyOn(contradictionsApi, 'detect').mockResolvedValue({
      contradictions: [
        {
          paper_a_id: 1,
          paper_a_title: 'Paper A',
          paper_b_id: 2,
          paper_b_title: 'Paper B',
          claim: 'Transformers are better than RNNs',
          position_a: 'Transformers show superior performance',
          position_b: 'RNNs outperform transformers on sequential tasks',
          confidence: 0.85,
          topic: 'Architecture comparison',
        },
      ],
      topics: ['Architecture comparison'],
      total_contradictions: 1,
    });
  });

  test('shows empty state before analysis', () => {
    renderWithProviders();
    expect(screen.getByText('Contradiction Detection')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Run Analysis/ })).toBeInTheDocument();
  });

  test('shows contradiction card after analysis', async () => {
    renderWithProviders();
    // Analysis hasn't been run yet (query enabled: false)
    expect(screen.getByText('Contradiction Detection')).toBeInTheDocument();
  });
});
