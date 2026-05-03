import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import OverviewPage from '../project/OverviewPage';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useParams: () => ({ projectId: '1' }), useNavigate: () => vi.fn() };
});

describe('OverviewPage', () => {
  it('renders with paper data', async () => {
    renderWithProviders(<OverviewPage />);
    await waitFor(() => {
      expect(screen.getByText(/Test Paper/i)).toBeInTheDocument();
    });
  });

  it('shows reading progress bar', async () => {
    renderWithProviders(<OverviewPage />);
    await waitFor(() => {
      // Progress bar shows "Completed" label from papers_by_reading
      expect(screen.getByText(/Completed/i)).toBeInTheDocument();
    });
  });

  it('shows stats from overview data', async () => {
    renderWithProviders(<OverviewPage />);
    await waitFor(() => {
      // Total papers is 5 from mock
      const fives = screen.getAllByText('5');
      expect(fives.length).toBeGreaterThanOrEqual(1);
    });
  });
});
