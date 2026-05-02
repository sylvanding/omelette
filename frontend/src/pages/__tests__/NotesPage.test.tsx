import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import NotesPage from '../project/NotesPage';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ projectId: '1' }),
  };
});

describe('NotesPage', () => {
  it('renders the page title', async () => {
    renderWithProviders(<NotesPage />);

    await waitFor(() => {
      expect(screen.getByText(/Notes Dashboard/i)).toBeInTheDocument();
    });
  });

  it('displays summary cards', async () => {
    renderWithProviders(<NotesPage />);

    await waitFor(() => {
      expect(screen.getByText(/Total Papers/i)).toBeInTheDocument();
      expect(screen.getByText(/Papers with Notes/i)).toBeInTheDocument();
      expect(screen.getByText(/Total Notes/i)).toBeInTheDocument();
    });
  });

  it('shows note cards with paper titles', async () => {
    renderWithProviders(<NotesPage />);

    await waitFor(() => {
      expect(screen.getAllByText(/Understanding Deep Learning Representations/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows search input', async () => {
    renderWithProviders(<NotesPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search across all notes/i)).toBeInTheDocument();
    });
  });

  it('shows reading status badges', async () => {
    renderWithProviders(<NotesPage />);

    await waitFor(() => {
      expect(screen.getAllByText(/read/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows updated dates', async () => {
    renderWithProviders(<NotesPage />);

    await waitFor(() => {
      expect(screen.getAllByText(/Updated/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows show more button for long notes', async () => {
    renderWithProviders(<NotesPage />);

    await waitFor(() => {
      expect(screen.getAllByText(/Show more/i).length).toBeGreaterThanOrEqual(1);
    });
  });
});
