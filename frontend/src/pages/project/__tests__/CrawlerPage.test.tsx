import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import CrawlerPage from '../CrawlerPage';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ projectId: '1' }),
    useNavigate: () => vi.fn(),
  };
});

describe('CrawlerPage', () => {
  it('renders the PDF Crawler page title', async () => {
    renderWithProviders(<CrawlerPage />);

    await waitFor(() => {
      expect(screen.getByText('PDF Crawler')).toBeInTheDocument();
    });
  });

  it('shows status cards', async () => {
    renderWithProviders(<CrawlerPage />);

    await waitFor(() => {
      expect(screen.getByText('Needs PDF')).toBeInTheDocument();
      expect(screen.getByText('PDF Downloaded')).toBeInTheDocument();
      expect(screen.getByText('Storage Used')).toBeInTheDocument();
      expect(screen.getByText('Total Papers')).toBeInTheDocument();
    });
  });

  it('shows download configuration panel', async () => {
    renderWithProviders(<CrawlerPage />);

    await waitFor(() => {
      expect(screen.getByText('Download PDFs')).toBeInTheDocument();
      expect(screen.getByText('High (most cited first)')).toBeInTheDocument();
      expect(screen.getByText('Low (newest first)')).toBeInTheDocument();
    });
  });

  it('shows start download button', async () => {
    renderWithProviders(<CrawlerPage />);

    await waitFor(() => {
      expect(screen.getByText('Start Download')).toBeInTheDocument();
    });
  });
});
