import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import OverviewPage from '../project/OverviewPage';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useParams: () => ({ projectId: '1' }), useNavigate: () => vi.fn() };
});

describe('OverviewPage', () => {
  it('renders reading progress', async () => {
    renderWithProviders(<OverviewPage />);
    await waitFor(() => {
      expect(screen.getByText(/Reading Progress/i)).toBeInTheDocument();
    });
  });
  it('shows recently added papers', async () => {
    renderWithProviders(<OverviewPage />);
    await waitFor(() => {
      expect(screen.getByText(/Recently Added/i)).toBeInTheDocument();
    });
  });
  it('shows reading goals card', async () => {
    renderWithProviders(<OverviewPage />);
    await waitFor(() => {
      expect(screen.getByText(/Reading Goals/i)).toBeInTheDocument();
    });
  });
});
