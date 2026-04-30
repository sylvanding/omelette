import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import { AudioOverviewDialog } from '../AudioOverviewDialog';

describe('AudioOverviewDialog', () => {
  const defaultProps = {
    projectId: 1,
    paperIds: [1, 2],
    paperTitles: ['Test Paper One', 'Test Paper Two'],
    onClose: vi.fn(),
  };

  it('renders the dialog title', () => {
    renderWithProviders(<AudioOverviewDialog {...defaultProps} />);

    expect(screen.getAllByText(/Audio Overview/i).length).toBeGreaterThanOrEqual(1);
  });

  it('shows the selected papers', () => {
    renderWithProviders(<AudioOverviewDialog {...defaultProps} />);

    expect(screen.getByText(/Test Paper One/i)).toBeInTheDocument();
    expect(screen.getByText(/Test Paper Two/i)).toBeInTheDocument();
  });

  it('shows the generate button initially', () => {
    renderWithProviders(<AudioOverviewDialog {...defaultProps} />);

    expect(screen.getByRole('button', { name: /Generate Audio Overview/i })).toBeInTheDocument();
  });

  it('displays audio player after generating', async () => {
    renderWithProviders(<AudioOverviewDialog {...defaultProps} />);

    const generateButton = screen.getByRole('button', { name: /Generate Audio Overview/i });
    generateButton.click();

    await waitFor(() => {
      expect(screen.getByText(/Welcome to our discussion/i)).toBeInTheDocument();
    });
  });

  it('shows play controls after generation', async () => {
    renderWithProviders(<AudioOverviewDialog {...defaultProps} />);

    const generateButton = screen.getByRole('button', { name: /Generate Audio Overview/i });
    generateButton.click();

    await waitFor(() => {
      expect(screen.getByLabelText('Play')).toBeInTheDocument();
    });
  });

  it('shows tone selector', () => {
    renderWithProviders(<AudioOverviewDialog {...defaultProps} />);

    expect(screen.getByText(/Tone/i)).toBeInTheDocument();
  });
});
