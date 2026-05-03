import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import PapersPage from '../project/PapersPage';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ projectId: '1' }),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    Outlet: () => null,
  };
});

describe('PapersPage', () => {
  it('renders paper title from mock data', async () => {
    renderWithProviders(<PapersPage />);
    await waitFor(() => {
      expect(screen.getByText(/Test Paper/i)).toBeInTheDocument();
    });
  });

  it('shows Add Papers button', async () => {
    renderWithProviders(<PapersPage />);
    await waitFor(() => {
      const buttons = screen.getAllByRole('button');
      const addBtn = buttons.find(b => b.textContent?.includes('Add Papers'));
      expect(addBtn).toBeTruthy();
    });
  });

  it('has search input', async () => {
    renderWithProviders(<PapersPage />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search title/i)).toBeInTheDocument();
    });
  });

  it('shows paper year and journal', async () => {
    renderWithProviders(<PapersPage />);
    await waitFor(() => {
      expect(screen.getByText(/Test Journal/i)).toBeInTheDocument();
      expect(screen.getByText(/2024/)).toBeInTheDocument();
    });
  });
});
