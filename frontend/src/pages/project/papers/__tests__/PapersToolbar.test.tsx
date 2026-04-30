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
    onBulkCitation: vi.fn(),
    onBulkTag: vi.fn(),
    onAuthorNetwork: vi.fn(),
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

  it('hides Citation Export button when no rows selected', () => {
    renderWithProviders(<PapersToolbar {...defaultProps} />);

    expect(screen.queryByRole('button', { name: /Citation Export|引用导出/i })).not.toBeInTheDocument();
  });

  it('shows Citation Export button when rows are selected', () => {
    renderWithProviders(
      <PapersToolbar {...defaultProps} selectedRows={new Set([1])} />,
    );

    const button = screen.getByRole('button', { name: /Citation Export|引用导出/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('(1)');
  });

  it('calls onBulkCitation when Citation Export button is clicked', () => {
    const onBulkCitation = vi.fn();
    renderWithProviders(
      <PapersToolbar {...defaultProps} selectedRows={new Set([1, 2])} onBulkCitation={onBulkCitation} />,
    );

    const button = screen.getByRole('button', { name: /Citation Export|引用导出/i });
    button.click();

    expect(onBulkCitation).toHaveBeenCalledTimes(1);
  });

  it('hides Add Tags button when no rows selected', () => {
    renderWithProviders(<PapersToolbar {...defaultProps} />);

    expect(screen.queryByRole('button', { name: /Add Tags|批量标签/i })).not.toBeInTheDocument();
  });

  it('shows Add Tags button when rows are selected', () => {
    renderWithProviders(
      <PapersToolbar {...defaultProps} selectedRows={new Set([1])} />,
    );

    const button = screen.getByRole('button', { name: /Add Tags|批量标签/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('(1)');
  });

  it('calls onBulkTag when Add Tags button is clicked', () => {
    const onBulkTag = vi.fn();
    renderWithProviders(
      <PapersToolbar {...defaultProps} selectedRows={new Set([1, 2])} onBulkTag={onBulkTag} />,
    );

    const button = screen.getByRole('button', { name: /Add Tags|批量标签/i });
    button.click();

    expect(onBulkTag).toHaveBeenCalledTimes(1);
  });
});
