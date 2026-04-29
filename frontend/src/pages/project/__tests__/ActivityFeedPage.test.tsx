import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import ActivityFeedPage from '../ActivityFeedPage';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ projectId: '1' }),
    useNavigate: () => vi.fn(),
  };
});

describe('ActivityFeedPage', () => {
  it('renders the activity feed with activity items', async () => {
    renderWithProviders(<ActivityFeedPage />);

    await waitFor(() => {
      expect(screen.getByText('Paper added')).toBeInTheDocument();
    });
  });

  it('shows activity details (paper title)', async () => {
    renderWithProviders(<ActivityFeedPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Test Paper').length).toBeGreaterThan(0);
    });
  });

  it('shows the action filter dropdown', async () => {
    renderWithProviders(<ActivityFeedPage />);

    await waitFor(() => {
      expect(screen.getByText('All actions')).toBeInTheDocument();
    });
  });

  it('shows relative timestamps', async () => {
    renderWithProviders(<ActivityFeedPage />);

    await waitFor(() => {
      const timestamps = screen.getAllByText(/just now|\dm ago|\dh ago|\dd ago/);
      expect(timestamps.length).toBeGreaterThan(0);
    });
  });

  it('shows date group headers', async () => {
    renderWithProviders(<ActivityFeedPage />);

    await waitFor(() => {
      expect(screen.getByText('Today')).toBeInTheDocument();
    });
  });
});
