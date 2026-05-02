import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import AudioOverviewsPage from '../project/AudioOverviewsPage';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ projectId: '1' }),
  };
});

describe('AudioOverviewsPage', () => {
  it('renders the page title', async () => {
    renderWithProviders(<AudioOverviewsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Audio Overviews/i)).toBeInTheDocument();
    });
  });

  it('displays the generate new button', async () => {
    renderWithProviders(<AudioOverviewsPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Generate New/i })).toBeInTheDocument();
    });
  });

  it('displays overview cards from the list', async () => {
    renderWithProviders(<AudioOverviewsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Introduction to Machine Learning/i)).toBeInTheDocument();
    });
  });

  it('shows play buttons for each overview', async () => {
    renderWithProviders(<AudioOverviewsPage />);

    await waitFor(() => {
      const playButtons = screen.getAllByRole('button', { name: /Play/i });
      expect(playButtons.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('shows tone badges on overview cards', async () => {
    renderWithProviders(<AudioOverviewsPage />);

    await waitFor(() => {
      expect(screen.getByText('conversational')).toBeInTheDocument();
      expect(screen.getByText('formal')).toBeInTheDocument();
    });
  });

  it('shows duration and paper count', async () => {
    renderWithProviders(<AudioOverviewsPage />);

    await waitFor(() => {
      expect(screen.getByText(/5 min/i)).toBeInTheDocument();
      expect(screen.getByText(/8 min/i)).toBeInTheDocument();
    });
  });
});
