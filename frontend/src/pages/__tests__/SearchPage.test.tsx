import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import userEvent from '@testing-library/user-event';
import SearchPage from '../project/SearchPage';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ projectId: '1' }),
  };
});

describe('SearchPage', () => {
  it('renders the search form with query input', async () => {
    renderWithProviders(<SearchPage />);

    expect(screen.getByPlaceholderText(/Search terms/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Search/i })).toBeInTheDocument();
  });

  it('displays source checkboxes', async () => {
    renderWithProviders(<SearchPage />);

    await waitFor(() => {
      expect(screen.getByText('Semantic Scholar')).toBeInTheDocument();
      expect(screen.getByText('OpenAlex')).toBeInTheDocument();
    });
  });

  it('shows source status badges', async () => {
    renderWithProviders(<SearchPage />);

    await waitFor(() => {
      expect(screen.getByText(/Semantic Scholar.*ok/i)).toBeInTheDocument();
    });
  });

  it('displays search results after search', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SearchPage />);

    const input = screen.getByPlaceholderText(/Search terms/i);
    await user.clear(input);
    await user.type(input, 'machine learning');

    const searchButton = screen.getByRole('button', { name: /Search/i });
    await user.click(searchButton);

    await waitFor(() => {
      expect(screen.getByText('Test Paper')).toBeInTheDocument();
    });
  });

  it('shows import all button when results are present', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SearchPage />);

    const input = screen.getByPlaceholderText(/Search terms/i);
    await user.clear(input);
    await user.type(input, 'machine learning');

    const searchButton = screen.getByRole('button', { name: /Search/i });
    await user.click(searchButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Import All/i })).toBeInTheDocument();
    });
  });

  it('shows max results slider', async () => {
    renderWithProviders(<SearchPage />);

    expect(screen.getByRole('slider')).toBeInTheDocument();
  });
});
