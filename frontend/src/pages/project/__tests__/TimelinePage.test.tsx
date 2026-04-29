import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import TimelinePage from '../TimelinePage';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ projectId: '1' }),
    useNavigate: () => vi.fn(),
  };
});

describe('TimelinePage', () => {
  it('renders the page with year groups', async () => {
    renderWithProviders(<TimelinePage />);

    await waitFor(() => {
      expect(screen.getAllByText('2024').length).toBeGreaterThan(0);
    });
  });

  it('shows paper count in timeline bar', async () => {
    renderWithProviders(<TimelinePage />);

    await waitFor(() => {
      expect(screen.getByText('1 paper(s)')).toBeInTheDocument();
    });
  });

  it('shows expand/collapse buttons', async () => {
    renderWithProviders(<TimelinePage />);

    await waitFor(() => {
      expect(screen.getAllByText(/Show more|Collapse/i).length).toBeGreaterThan(0);
    });
  });

  it('expands year group on click to show paper title', async () => {
    const { container } = renderWithProviders(<TimelinePage />);

    await waitFor(() => {
      expect(screen.getAllByText('2024').length).toBeGreaterThan(0);
    });

    // Click the year group header button to expand
    const yearButton = container.querySelector('.rounded-lg.border.bg-card button') as HTMLElement | null;
    if (yearButton) {
      yearButton.click();
    }

    await waitFor(() => {
      expect(screen.getByText('Test Paper')).toBeInTheDocument();
    });
  });

  it('shows timeline bar with year nodes', async () => {
    renderWithProviders(<TimelinePage />);

    await waitFor(() => {
      const timelineBar = document.querySelector('.overflow-x-auto');
      expect(timelineBar).toBeInTheDocument();
    });
  });
});
