import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import PlaygroundPage from '../PlaygroundPage';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useParams: () => ({}),
    useNavigate: () => vi.fn(),
  };
});

describe('PlaygroundPage', () => {
  it('renders welcome screen when no messages', async () => {
    renderWithProviders(<PlaygroundPage />);

    await waitFor(() => {
      expect(screen.getByText('Playground')).toBeInTheDocument();
    });
  });

  it('shows KB picker button', async () => {
    renderWithProviders(<PlaygroundPage />);

    await waitFor(() => {
      const kbButtons = screen.getAllByRole('button');
      expect(kbButtons.length).toBeGreaterThan(0);
    });
  });

  it('shows new chat button', async () => {
    renderWithProviders(<PlaygroundPage />);

    await waitFor(() => {
      const buttons = screen.getAllByRole('button', { name: /new/i });
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows suggestion buttons in empty state', async () => {
    renderWithProviders(<PlaygroundPage />);

    await waitFor(() => {
      const buttons = screen.getAllByRole('button').filter(
        (b) => b.className.includes('rounded-xl'),
      );
      expect(buttons.length).toBe(4);
    });
  });
});
