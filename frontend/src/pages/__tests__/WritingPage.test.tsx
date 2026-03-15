import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import WritingPage from '../project/WritingPage';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ projectId: '1' }),
  };
});

describe('WritingPage', () => {
  it('renders tab buttons for all modes', async () => {
    renderWithProviders(<WritingPage />);

    await waitFor(() => {
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThanOrEqual(4);
    });
  });

  it('shows generate button', async () => {
    renderWithProviders(<WritingPage />);

    await waitFor(() => {
      const buttons = screen.getAllByRole('button', { name: /generate|生成/i });
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows output panel', async () => {
    renderWithProviders(<WritingPage />);

    const outputEl = screen.getByText(/output|输出/i);
    expect(outputEl).toBeInTheDocument();
  });
});
