import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RelatedPapers from '../RelatedPapers';

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
  return {
    ...actual,
    useQuery: vi.fn(),
  };
});

import { useQuery } from '@tanstack/react-query';

const mockUseQuery = vi.mocked(useQuery);

describe('RelatedPapers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderWithRouter = (ui: React.ReactElement) => {
    return render(<MemoryRouter>{ui}</MemoryRouter>);
  };

  it('shows loading state while fetching', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as never);

    renderWithRouter(<RelatedPapers projectId={1} paperId={1} />);
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows empty state when no related papers', () => {
    mockUseQuery.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as never);

    renderWithRouter(<RelatedPapers projectId={1} paperId={1} />);
    expect(screen.getByText('No related papers found')).toBeInTheDocument();
    expect(screen.getByText('Index paper content to enable semantic similarity matching')).toBeInTheDocument();
  });

  it('renders related papers with similarity scores', () => {
    const mockPapers = [
      {
        id: 2,
        title: 'Related Paper One',
        authors: ['Author A', 'Author B'],
        year: 2023,
        journal: 'Related Journal',
        citation_count: 25,
        similarity_score: 92.5,
      },
      {
        id: 3,
        title: 'Related Paper Two',
        authors: ['Author C'],
        year: 2022,
        journal: 'Another Journal',
        citation_count: 15,
        similarity_score: 78.3,
      },
    ];

    mockUseQuery.mockReturnValue({
      data: mockPapers,
      isLoading: false,
      error: null,
    } as never);

    renderWithRouter(<RelatedPapers projectId={1} paperId={1} />);

    expect(screen.getByText('Related Paper One')).toBeInTheDocument();
    expect(screen.getByText('Related Paper Two')).toBeInTheDocument();
    expect(screen.getByText('92.5%')).toBeInTheDocument();
    expect(screen.getByText('78.3%')).toBeInTheDocument();
    expect(screen.getByText('Author A, Author B')).toBeInTheDocument();
    expect(screen.getByText('2023')).toBeInTheDocument();
  });

  it('shows citation count when present', () => {
    const mockPapers = [
      {
        id: 2,
        title: 'Cited Paper',
        authors: ['Author A'],
        year: 2023,
        journal: 'Test Journal',
        citation_count: 42,
        similarity_score: 85.0,
      },
    ];

    mockUseQuery.mockReturnValue({
      data: mockPapers,
      isLoading: false,
      error: null,
    } as never);

    renderWithRouter(<RelatedPapers projectId={1} paperId={1} />);

    expect(screen.getByText('Test Journal')).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes('42'))).toBeInTheDocument();
  });

  it('truncates author list when more than 3', () => {
    const mockPapers = [
      {
        id: 2,
        title: 'Multi-author Paper',
        authors: ['A', 'B', 'C', 'D', 'E'],
        year: 2024,
        journal: 'Journal',
        citation_count: 0,
        similarity_score: 70.0,
      },
    ];

    mockUseQuery.mockReturnValue({
      data: mockPapers,
      isLoading: false,
      error: null,
    } as never);

    renderWithRouter(<RelatedPapers projectId={1} paperId={1} />);

    expect(screen.getByText('A, B, C et al.')).toBeInTheDocument();
  });
});
