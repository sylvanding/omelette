import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import DedupPage from '../DedupPage';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ projectId: '1' }),
    useNavigate: () => vi.fn(),
  };
});

describe('DedupPage', () => {
  it('renders the deduplication page title', async () => {
    renderWithProviders(<DedupPage />);

    await waitFor(() => {
      expect(screen.getByText('Deduplication')).toBeInTheDocument();
    });
  });

  it('shows status cards', async () => {
    renderWithProviders(<DedupPage />);

    await waitFor(() => {
      expect(screen.getByText('Total Papers')).toBeInTheDocument();
      expect(screen.getByText('Duplicates Found')).toBeInTheDocument();
      expect(screen.getByText('Pending Review')).toBeInTheDocument();
      expect(screen.getByText('Clean Papers')).toBeInTheDocument();
    });
  });

  it('shows scan strategy selector', async () => {
    renderWithProviders(<DedupPage />);

    await waitFor(() => {
      expect(screen.getByText('Full scan')).toBeInTheDocument();
      expect(screen.getByText('DOI only')).toBeInTheDocument();
      expect(screen.getByText('Title only')).toBeInTheDocument();
    });
  });

  it('shows run deduplication button', async () => {
    renderWithProviders(<DedupPage />);

    await waitFor(() => {
      expect(screen.getByText('Run Deduplication')).toBeInTheDocument();
    });
  });
});
