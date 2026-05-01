import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, userEvent } from '@/test/utils';
import { CitationStylePicker } from '../CitationStylePicker';
import { CITATION_STYLES } from '../citation-styles';

describe('CitationStylePicker', () => {
  it('renders all citation style options', () => {
    renderWithProviders(<CitationStylePicker value="apa" onChange={() => {}} />);

    for (const style of CITATION_STYLES) {
      expect(screen.getByRole('button', { name: style.label })).toBeInTheDocument();
    }
  });

  it('highlights the currently selected style', () => {
    renderWithProviders(<CitationStylePicker value="mla" onChange={() => {}} />);

    const selectedButton = screen.getByRole('button', { name: 'MLA' });
    expect(selectedButton).toHaveClass('bg-background');
  });

  it('calls onChange when a style button is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(<CitationStylePicker value="apa" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'IEEE' }));
    expect(onChange).toHaveBeenCalledWith('ieee');
  });

  it('applies custom className', () => {
    renderWithProviders(
      <CitationStylePicker value="apa" onChange={() => {}} className="test-class" />,
    );

    expect(screen.getByRole('button', { name: 'APA' }).parentElement).toHaveClass('test-class');
  });
});
