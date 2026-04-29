import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import NotesPanel from '../NotesPanel';

describe('NotesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const defaultProps = {
    paperId: 1,
    projectId: 1,
    notes: '',
    onSave: vi.fn().mockResolvedValue(undefined),
  };

  it('renders empty notes editor', () => {
    render(<NotesPanel {...defaultProps} />);
    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue('');
  });

  it('renders existing notes content', () => {
    render(
      <NotesPanel {...defaultProps} notes={'## My Notes\nSome content here'} />,
    );
    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveValue('## My Notes\nSome content here');
  });

  it('shows save status when typing', () => {
    const { container } = render(<NotesPanel {...defaultProps} />);
    const textarea = screen.getByRole('textbox');

    fireEvent.change(textarea, { target: { value: 'new note' } });

    // Check that the textarea value actually changed
    expect(textarea).toHaveValue('new note');

    // The status span should show "Saving..."
    const spans = container.querySelectorAll('span.text-xs');
    const statusSpan = Array.from(spans).find(
      (s) => s.textContent === 'Saving...' || s.textContent === 'Saved' || s.textContent === 'Save failed',
    );
    expect(statusSpan?.textContent).toBe('Saving...');
  });

  it('switches to preview tab and renders markdown', () => {
    render(<NotesPanel {...defaultProps} notes="## Title" />);

    const tabs = screen.getAllByRole('tab');
    const previewTab = tabs.find((t) => t.textContent?.includes('Preview'));
    if (previewTab) {
      fireEvent.click(previewTab);
    }

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('Title');
  });
});
