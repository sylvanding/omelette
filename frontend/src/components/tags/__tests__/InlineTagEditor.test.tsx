import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, userEvent } from '@/test/utils';
import { InlineTagEditor } from '../InlineTagEditor';

function renderEditor(tags: string[] | null = null, onTagsChange = vi.fn()) {
  renderWithProviders(<InlineTagEditor tags={tags} onTagsChange={onTagsChange} />);
  return onTagsChange;
}

describe('InlineTagEditor', () => {
  it('shows add tag button when no tags exist', () => {
    renderEditor(null);
    expect(screen.getByText(/add tag/i)).toBeInTheDocument();
  });

  it('renders existing tags as badges', () => {
    renderEditor(['important', 'reviewed']);
    expect(screen.getByText('important')).toBeInTheDocument();
    expect(screen.getByText('reviewed')).toBeInTheDocument();
  });

  it('calls onTagsChange when adding a new tag', async () => {
    const onTagsChange = renderEditor(['existing']);
    const addBtn = screen.getByRole('button', { name: /add tag/i });
    await userEvent.click(addBtn);

    const input = screen.getByPlaceholderText(/add tag/i);
    await userEvent.type(input, 'new-tag{enter}');

    expect(onTagsChange).toHaveBeenCalledWith(['existing', 'new-tag']);
  });

  it('calls onTagsChange when removing a tag', async () => {
    const onTagsChange = renderEditor(['remove-me', 'keep']);
    const removeBtns = screen.getAllByRole('button', { name: /remove tag/i });
    await userEvent.click(removeBtns[0]);

    expect(onTagsChange).toHaveBeenCalledWith(['keep']);
  });

  it('does not add duplicate tags', async () => {
    const onTagsChange = renderEditor(['same']);
    const addBtn = screen.getByRole('button', { name: /add tag/i });
    await userEvent.click(addBtn);

    const input = screen.getByPlaceholderText(/add tag/i);
    await userEvent.type(input, 'same{enter}');

    expect(onTagsChange).not.toHaveBeenCalled();
  });

  it('does not add empty tags', async () => {
    const onTagsChange = renderEditor([]);
    const addBtn = screen.getByRole('button', { name: /add tag/i });
    await userEvent.click(addBtn);

    const input = screen.getByPlaceholderText(/add tag/i);
    await userEvent.type(input, '   {enter}');

    expect(onTagsChange).not.toHaveBeenCalled();
  });
});
