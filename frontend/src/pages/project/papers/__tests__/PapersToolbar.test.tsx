import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen } from '@/test/utils';
import { PapersToolbar } from '../PapersToolbar';

describe('PapersToolbar', () => {
  const defaultProps = {
    selectedRows: new Set<string | number>(),
    needsProcessing: false,
    isBatchDeleting: false,
    onBatchDelete: vi.fn(),
    onProcessAll: vi.fn(),
    onAddPaper: vi.fn(),
    onCompare: vi.fn(),
    onAudioOverview: vi.fn(),
    onExport: vi.fn(),
    onAuthorNetwork: vi.fn(),
    onBibliography: vi.fn(),
    projectId: 1,
    paperFilters: {},
    paperCount: 0,
  };

  it('hides Compare button when no rows selected', () => {
    renderWithProviders(<PapersToolbar {...defaultProps} />);

    expect(screen.queryByRole('button', { name: /Compare|对比/i })).not.toBeInTheDocument();
  });

  it('disables Compare button when only 1 row selected', () => {
    renderWithProviders(
      <PapersToolbar {...defaultProps} selectedRows={new Set([1])} />,
    );

    const button = screen.getByRole('button', { name: /Compare|对比/i });
    expect(button).toBeDisabled();
  });

  it('enables Compare button when 2 rows selected', () => {
    renderWithProviders(
      <PapersToolbar {...defaultProps} selectedRows={new Set([1, 2])} />,
    );

    const button = screen.getByRole('button', { name: /Compare|对比/i });
    expect(button).not.toBeDisabled();
  });

  it('enables Compare button when 5 rows selected', () => {
    renderWithProviders(
      <PapersToolbar
        {...defaultProps}
        selectedRows={new Set([1, 2, 3, 4, 5])}
      />,
    );

    const button = screen.getByRole('button', { name: /Compare|对比/i });
    expect(button).not.toBeDisabled();
  });

  it('disables Compare button when more than 5 rows selected', () => {
    renderWithProviders(
      <PapersToolbar
        {...defaultProps}
        selectedRows={new Set([1, 2, 3, 4, 5, 6])}
      />,
    );

    const button = screen.getByRole('button', { name: /Compare|对比/i });
    expect(button).toBeDisabled();
  });

  it('calls onCompare when Compare button is clicked', () => {
    const onCompare = vi.fn();
    renderWithProviders(
      <PapersToolbar {...defaultProps} selectedRows={new Set([1, 2])} onCompare={onCompare} />,
    );

    const button = screen.getByRole('button', { name: /Compare|对比/i });
    button.click();

    expect(onCompare).toHaveBeenCalledTimes(1);
  });
});
