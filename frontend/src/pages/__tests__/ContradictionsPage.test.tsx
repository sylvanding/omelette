import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ContradictionsPage from '@/pages/project/ContradictionsPage';
import { vi } from 'vitest';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

vi.mock('@/components/contradiction/ContradictionReport', () => ({
  ContradictionReport: () => <div data-testid="contradiction-report">Contradiction Report</div>,
}));

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

describe('ContradictionsPage', () => {
  test('renders page layout with ContradictionReport component', () => {
    renderWithProviders();
    expect(screen.getByText('Contradictions')).toBeInTheDocument();
    expect(screen.getByTestId('contradiction-report')).toBeInTheDocument();
  });
});
