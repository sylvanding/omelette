import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import AnalyticsPage from '../project/AnalyticsPage';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ projectId: '1' }),
  };
});

describe('AnalyticsPage', () => {
  it('renders the page title', async () => {
    renderWithProviders(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Reading Analytics|阅读分析/i)).toBeInTheDocument();
    });
  });

  it('displays summary cards', async () => {
    renderWithProviders(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Total Papers|论文总数/i)).toBeInTheDocument();
    });
  });

  it('shows reading progress chart section', async () => {
    renderWithProviders(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Reading Progress|阅读进度/i)).toBeInTheDocument();
    });
  });

  it('shows weekly reads chart section', async () => {
    renderWithProviders(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Papers Read per Week|每周阅读数/i)).toBeInTheDocument();
    });
  });

  it('shows top journals section', async () => {
    renderWithProviders(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Top Journals|热门期刊/i)).toBeInTheDocument();
    });
  });
});
