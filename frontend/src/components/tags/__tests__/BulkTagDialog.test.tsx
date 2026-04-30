import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, userEvent } from '@/test/utils';
import { BulkTagDialog } from '../BulkTagDialog';

function renderDialog(props: Partial<React.ComponentProps<typeof BulkTagDialog>> = {}) {
  const defaultProps = {
    selectedCount: 3,
    existingTags: ['important', 'reviewed'],
    onApply: vi.fn(),
    onClose: vi.fn(),
    ...props,
  };
  renderWithProviders(<BulkTagDialog {...defaultProps} />);
  return defaultProps;
}

describe('BulkTagDialog', () => {
  it('renders with paper count', () => {
    renderDialog({ selectedCount: 5 });
    expect(screen.getByText(/5 papers/i)).toBeInTheDocument();
  });

  it('shows existing tags as removable options', () => {
    renderDialog({ existingTags: ['alpha', 'beta'] });
    expect(screen.getByText('-alpha')).toBeInTheDocument();
    expect(screen.getByText('-beta')).toBeInTheDocument();
  });

  it('calls onApply with added tags', async () => {
    const { onApply } = renderDialog();
    const input = screen.getByPlaceholderText(/add tag/i);
    await userEvent.type(input, 'new-tag{enter}');

    const applyBtn = screen.getByRole('button', { name: /apply/i });
    await userEvent.click(applyBtn);

    expect(onApply).toHaveBeenCalledWith(['new-tag'], []);
  });

  it('calls onApply with tags to remove', async () => {
    const { onApply } = renderDialog();
    const removeTag = screen.getByText('-important');
    await userEvent.click(removeTag);

    const applyBtn = screen.getByRole('button', { name: /apply/i });
    await userEvent.click(applyBtn);

    expect(onApply).toHaveBeenCalledWith([], ['important']);
  });

  it('calls onClose when cancel is clicked', async () => {
    const { onClose } = renderDialog();
    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    await userEvent.click(cancelBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables apply when no changes made', () => {
    renderDialog();
    const applyBtn = screen.getByRole('button', { name: /apply/i });
    expect(applyBtn).toBeDisabled();
  });
});
