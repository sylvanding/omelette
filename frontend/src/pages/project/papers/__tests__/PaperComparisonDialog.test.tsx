import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import { PaperComparisonDialog } from '../PaperComparisonDialog';

describe('PaperComparisonDialog', () => {
  const defaultProps = {
    projectId: 1,
    paperIds: [1, 2],
    onClose: vi.fn(),
  };

  it('renders the dialog title', () => {
    renderWithProviders(<PaperComparisonDialog {...defaultProps} />);

    expect(screen.getByText(/Paper Comparison|论文对比/i)).toBeInTheDocument();
  });

  it('shows the compare button initially', () => {
    renderWithProviders(<PaperComparisonDialog {...defaultProps} />);

    expect(screen.getByRole('button', { name: /Compare|对比/i })).toBeInTheDocument();
  });

  it('displays comparison data after clicking compare', async () => {
    renderWithProviders(<PaperComparisonDialog {...defaultProps} />);

    const compareButton = screen.getByRole('button', { name: /Compare|对比/i });
    compareButton.click();

    await waitFor(() => {
      expect(screen.getByText(/AI Summary|AI 总结/i)).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Mock AI-generated comparison/i),
    ).toBeInTheDocument();
  });

  it('shows dimension content cells', async () => {
    renderWithProviders(<PaperComparisonDialog {...defaultProps} />);

    const compareButton = screen.getByRole('button', { name: /Compare|对比/i });
    compareButton.click();

    await waitFor(() => {
      expect(screen.getByText(/Paper 1 investigates research question 1/i)).toBeInTheDocument();
    });
  });

  it('shows regenerate button after successful comparison', async () => {
    renderWithProviders(<PaperComparisonDialog {...defaultProps} />);

    const compareButton = screen.getByRole('button', { name: /Compare|对比/i });
    compareButton.click();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Regenerate/i })).toBeInTheDocument();
    });
  });
});
