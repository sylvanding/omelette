import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PDFViewer from '../PDFViewer';

// Mock react-pdf module - must fully replace it to avoid import.meta.url crash
vi.mock('react-pdf', () => ({
  Document: vi.fn(({ children }: { children: React.ReactNode }) => (
    <div data-testid="pdf-document">{children}</div>
  )),
  Page: vi.fn(({ pageNumber }: { pageNumber: number }) => (
    <div data-testid="pdf-page" data-page={pageNumber}>
      Page {pageNumber}
    </div>
  )),
  pdfjs: {
    GlobalWorkerOptions: {
      workerSrc: 'mocked-worker',
    },
  },
}));

describe('PDFViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders PDF viewer with toolbar', () => {
    render(<PDFViewer url="/test.pdf" />);
    expect(screen.getByTestId('pdf-document')).toBeInTheDocument();
  });

  it('shows zoom controls and current zoom percentage', () => {
    render(<PDFViewer url="/test.pdf" />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('shows page navigation with current page indicator', () => {
    render(<PDFViewer url="/test.pdf" />);
    // numPages shows as "?" until PDF loads (mock doesn't trigger onLoadSuccess)
    expect(screen.getByText(/1 \/ \?/)).toBeInTheDocument();
  });

  it('disables previous button on first page', () => {
    render(<PDFViewer url="/test.pdf" />);
    const buttons = screen.getAllByRole('button');
    // Zoom out (0), zoom in (1), prev page (2), next page (3)
    const prevButton = buttons[2];
    expect(prevButton).toBeDisabled();
  });

  it('calls onTextSelect when text is selected', () => {
    const handleTextSelect = vi.fn();
    const { container } = render(
      <PDFViewer url="/test.pdf" onTextSelect={handleTextSelect} />,
    );

    const mockSelection = { toString: () => 'selected text' };
    vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection as unknown as Selection);

    const pdfContainer = container.querySelector('.overflow-auto');
    if (pdfContainer) {
      fireEvent.mouseUp(pdfContainer);
    }

    expect(handleTextSelect).toHaveBeenCalledWith('selected text', 1);
    vi.restoreAllMocks();
  });

  it('does not call onTextSelect when no text is selected', () => {
    const handleTextSelect = vi.fn();
    const { container } = render(
      <PDFViewer url="/test.pdf" onTextSelect={handleTextSelect} />,
    );

    const mockSelection = { toString: () => '' };
    vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection as unknown as Selection);

    const pdfContainer = container.querySelector('.overflow-auto');
    if (pdfContainer) {
      fireEvent.mouseUp(pdfContainer);
    }

    expect(handleTextSelect).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('renders without crashing when no onTextSelect prop provided', () => {
    render(<PDFViewer url="/test.pdf" />);
    expect(screen.getByTestId('pdf-document')).toBeInTheDocument();
  });
});
