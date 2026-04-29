import { describe, it, expect } from 'vitest';
import { renderWithProviders, screen, userEvent } from '@/test/utils';
import CitationCard from '../CitationCard';
import type { Citation } from '@/types/chat';

const mockCitation: Citation = {
  index: 1,
  paper_id: 10,
  paper_title: 'Test Paper Title',
  chunk_type: 'abstract',
  page_number: 5,
  relevance_score: 0.95,
  excerpt: 'This is a relevant excerpt from the paper.',
  authors: ['Alice Smith', 'Bob Jones'],
  year: 2024,
  doi: '10.1234/test',
};

describe('CitationCard', () => {
  it('renders paper title and citation index', () => {
    renderWithProviders(
      <CitationCard
        citation={mockCitation}
        colorIndex={0}
        isExpanded={false}
        onToggle={() => {}}
      />,
    );
    expect(screen.getByText('Test Paper Title')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('shows page number when available', () => {
    renderWithProviders(
      <CitationCard
        citation={mockCitation}
        colorIndex={0}
        isExpanded={false}
        onToggle={() => {}}
      />,
    );
    expect(screen.getByText('p.5')).toBeInTheDocument();
  });

  it('shows relevance percentage badge', () => {
    renderWithProviders(
      <CitationCard
        citation={mockCitation}
        colorIndex={0}
        isExpanded={false}
        onToggle={() => {}}
      />,
    );
    expect(screen.getByText('95%')).toBeInTheDocument();
  });

  it('calls onToggle when clicked', async () => {
    const user = userEvent.setup();
    let toggled = false;
    renderWithProviders(
      <CitationCard
        citation={mockCitation}
        colorIndex={0}
        isExpanded={false}
        onToggle={() => { toggled = true; }}
      />,
    );
    await user.click(screen.getByRole('button'));
    expect(toggled).toBe(true);
  });

  it('does not show page number when zero', () => {
    renderWithProviders(
      <CitationCard
        citation={{ ...mockCitation, page_number: 0 }}
        colorIndex={0}
        isExpanded={false}
        onToggle={() => {}}
      />,
    );
    expect(screen.queryByText(/p\.0/)).not.toBeInTheDocument();
  });

  it('formats authors with "et al." when more than 2', () => {
    renderWithProviders(
      <CitationCard
        citation={{ ...mockCitation, authors: ['A', 'B', 'C', 'D'] }}
        colorIndex={0}
        isExpanded={true}
        onToggle={() => {}}
      />,
    );
    // Authors are shown in expanded view
    expect(screen.getByText('A et al.')).toBeInTheDocument();
  });

  it('shows DOI link when available', () => {
    renderWithProviders(
      <CitationCard
        citation={mockCitation}
        colorIndex={0}
        isExpanded={true}
        onToggle={() => {}}
      />,
    );
    const doiLink = screen.getByText('DOI');
    expect(doiLink).toBeInTheDocument();
    expect(doiLink.closest('a')).toHaveAttribute('href', 'https://doi.org/10.1234/test');
  });
});
