import { renderWithProviders, screen } from '@/test/utils';
import { ExportDialog } from '../ExportDialog';
import type { Paper } from '@/types';

describe('ExportDialog', () => {
  const mockPapers: Paper[] = [
    {
      id: 1,
      project_id: 1,
      doi: '10.1234/test',
      title: 'Test Paper',
      abstract: 'A test abstract',
      authors: [{ name: 'Alice Smith' }],
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
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
  ];

  const defaultProps = {
    projectId: 1,
    papers: mockPapers,
    projectName: 'Test Project',
    onClose: vi.fn(),
  };

  it('renders the dialog title', () => {
    renderWithProviders(<ExportDialog {...defaultProps} />);
    expect(screen.getByText('Export to Reference Manager')).toBeInTheDocument();
  });

  it('shows the paper count and project name', () => {
    renderWithProviders(<ExportDialog {...defaultProps} />);
    expect(screen.getByText(/1 paper will be exported from .Test Project./)).toBeInTheDocument();
  });

  it('shows download format options', () => {
    renderWithProviders(<ExportDialog {...defaultProps} />);
    expect(screen.getByText('BibTeX')).toBeInTheDocument();
    expect(screen.getByText('RIS')).toBeInTheDocument();
    expect(screen.getByText('EndNote')).toBeInTheDocument();
  });

  it('shows Zotero tab', () => {
    renderWithProviders(<ExportDialog {...defaultProps} />);
    expect(screen.getByText('Download')).toBeInTheDocument();
    expect(screen.getByText('Zotero')).toBeInTheDocument();
  });

  it('renders as an overlay dialog', () => {
    renderWithProviders(<ExportDialog {...defaultProps} />);
    // The dialog should have a fixed overlay
    const overlay = document.querySelector('.fixed.inset-0');
    expect(overlay).toBeTruthy();
  });

  it('renders with multiple papers with correct plural', () => {
    const papers2 = [...mockPapers, { ...mockPapers[0], id: 2, doi: '10.1234/other' }];
    renderWithProviders(
      <ExportDialog {...defaultProps} papers={papers2} />,
    );
    expect(screen.getByText(/2 papers will be exported/)).toBeInTheDocument();
  });
});
