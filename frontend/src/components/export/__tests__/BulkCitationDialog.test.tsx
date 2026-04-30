import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithProviders, screen } from '@/test/utils';
import { BulkCitationDialog } from '../BulkCitationDialog';
import type { Paper } from '@/types';

const now = new Date().toISOString();

const mockPapers: Paper[] = [
  {
    id: 1,
    project_id: 1,
    doi: '10.1234/test',
    title: 'Deep Learning for NLP',
    abstract: 'A test abstract',
    authors: [{ name: 'Alice Smith' }, { name: 'Bob Jones' }],
    journal: 'Test Journal',
    year: 2024,
    citation_count: 10,
    source: 'semantic_scholar',
    source_id: '123',
    pdf_path: '',
    pdf_url: '',
    status: 'indexed',
    tags: null,
    notes: '',
    reading_status: 'unread',
    read_at: null,
    rating: 0,
    quality_tags: null,
    created_at: now,
    updated_at: now,
  },
];

describe('BulkCitationDialog', () => {
  const defaultProps = {
    papers: mockPapers,
    onClose: vi.fn(),
  };

  it('renders the dialog title with paper count', () => {
    renderWithProviders(<BulkCitationDialog {...defaultProps} />);
    expect(screen.getByText(/Citation Export \(1\)/)).toBeInTheDocument();
  });

  it('shows format tabs (BibTeX, APA, MLA)', () => {
    renderWithProviders(<BulkCitationDialog {...defaultProps} />);
    expect(screen.getByText('BibTeX')).toBeInTheDocument();
    expect(screen.getByText('APA 7th')).toBeInTheDocument();
    expect(screen.getByText('MLA 9th')).toBeInTheDocument();
  });

  it('shows BibTeX content by default', () => {
    renderWithProviders(<BulkCitationDialog {...defaultProps} />);
    expect(screen.getByText(/@article\{/)).toBeInTheDocument();
  });

  it('shows copy and download buttons', () => {
    renderWithProviders(<BulkCitationDialog {...defaultProps} />);
    expect(screen.getByRole('button', { name: /Copy/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download/i })).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    renderWithProviders(<BulkCitationDialog {...defaultProps} onClose={onClose} />);
    screen.getByRole('button', { name: /close/i }).click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows correct paper count in title for multiple papers', () => {
    const papers2 = [...mockPapers, { ...mockPapers[0], id: 2, doi: '10.5678/other' }];
    renderWithProviders(<BulkCitationDialog {...defaultProps} papers={papers2} />);
    expect(screen.getByText(/Citation Export \(2\)/)).toBeInTheDocument();
  });

  it('shows empty state when no papers', () => {
    renderWithProviders(<BulkCitationDialog {...defaultProps} papers={[]} />);
    expect(screen.getByText('No papers to export')).toBeInTheDocument();
  });
});

describe('BulkCitationDialog copy', () => {
  let mockWriteText: ReturnType<typeof vi.fn>;

  const defaultProps = {
    papers: mockPapers,
    onClose: vi.fn(),
  };

  beforeEach(() => {
    mockWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: mockWriteText },
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('copies citation text to clipboard when copy button is clicked', async () => {
    renderWithProviders(<BulkCitationDialog {...defaultProps} />);
    const copyButton = screen.getByRole('button', { name: /Copy/i });
    copyButton.click();
    await vi.waitFor(() => {
      expect(mockWriteText).toHaveBeenCalled();
    });
  });
});
