import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import TrendsPage from '../project/TrendsPage';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ projectId: '1' }),
  };
});

describe('TrendsPage', () => {
  it('renders the page title', async () => {
    renderWithProviders(<TrendsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Research Trends/i)).toBeInTheDocument();
    });
  });

  it('displays summary cards', async () => {
    renderWithProviders(<TrendsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Total Papers/i)).toBeInTheDocument();
    });
  });

  it('shows publication volume chart section', async () => {
    renderWithProviders(<TrendsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Publication Volume/i)).toBeInTheDocument();
    });
  });

  it('shows citations over time chart section', async () => {
    renderWithProviders(<TrendsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Citations Over Time/i)).toBeInTheDocument();
    });
  });

  it('shows topic trends chart section', async () => {
    renderWithProviders(<TrendsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Topic Trends/i)).toBeInTheDocument();
    });
  });

  it('shows emerging topics section', async () => {
    renderWithProviders(<TrendsPage />);

    await waitFor(() => {
      expect(screen.getAllByText(/Emerging Topics/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows declining topics section', async () => {
    renderWithProviders(<TrendsPage />);

    await waitFor(() => {
      expect(screen.getAllByText(/Declining Topics/i).length).toBeGreaterThanOrEqual(1);
    });
  });
});
