import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WritingOutputPanel } from '../WritingOutputPanel';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('WritingOutputPanel', () => {
  const mockClipboard = { writeText: vi.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      value: mockClipboard,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const defaultProps = {
    activeTab: 'summarize',
    output: '',
    reviewContent: '',
    displayContent: '',
    reviewStreaming: false,
    reviewCitations: {},
    onCopy: vi.fn(),
    onDownload: vi.fn(),
  };

  it('renders empty state with placeholder', () => {
    render(<WritingOutputPanel {...defaultProps} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders markdown headings in non-review output', () => {
    const { container } = render(
      <WritingOutputPanel
        {...defaultProps}
        output="## Paper Title\nSome summary here"
      />,
    );

    // Query within the output content area (the scrollable div below the header)
    const outputArea = container.querySelector('.max-h-96, .max-h-\\[70vh\\]');
    expect(outputArea).toBeTruthy();

    const heading = outputArea!.querySelector('h2');
    expect(heading).toBeTruthy();
    expect(heading!.textContent).toContain('Paper Title');
  });

  it('renders markdown lists in non-review output', () => {
    render(
      <WritingOutputPanel
        {...defaultProps}
        output={"- Item one\n- Item two\n- Item three"}
      />,
    );

    const list = screen.getByRole('list');
    expect(list).toBeInTheDocument();
    expect(screen.getByText('Item one')).toBeInTheDocument();
    expect(screen.getByText('Item two')).toBeInTheDocument();
    expect(screen.getByText('Item three')).toBeInTheDocument();
  });

  it('renders code in non-review output', () => {
    render(
      <WritingOutputPanel
        {...defaultProps}
        output={'Here is some `inline code` in the text'}
      />,
    );

    const code = screen.getByRole('code');
    expect(code).toHaveTextContent('inline code');
  });

  it('shows copy and download buttons when output has content', () => {
    render(
      <WritingOutputPanel
        {...defaultProps}
        output="## Some output"
      />,
    );

    // Buttons use Chinese labels (复制 / 下载) from default translation fallback
    const buttons = screen.getAllByRole('button');
    const copyBtn = buttons.find((b) => b.textContent?.includes('复制'));
    const downloadBtn = buttons.find((b) => b.textContent?.includes('下载'));
    expect(copyBtn).toBeDefined();
    expect(downloadBtn).toBeDefined();
  });

  it('hides copy and download buttons when output is empty', () => {
    render(<WritingOutputPanel {...defaultProps} />);

    const buttons = screen.queryAllByRole('button');
    const hasCopyOrDownload = buttons.some(
      (b) => b.textContent?.includes('复制') || b.textContent?.includes('下载'),
    );
    expect(hasCopyOrDownload).toBe(false);
  });

  it('copies output text to clipboard when copy button is clicked', async () => {
    render(
      <WritingOutputPanel
        {...defaultProps}
        output={'## Summary\nThis is the summary.'}
      />,
    );

    const buttons = screen.getAllByRole('button');
    const copyBtn = buttons.find((b) => b.textContent?.includes('复制'))!;
    fireEvent.click(copyBtn);

    expect(mockClipboard.writeText).toHaveBeenCalledWith('## Summary\nThis is the summary.');
  });

  it('triggers download when download button is clicked', () => {
    const clickSpy = vi.fn();
    const origCreateElement = document.createElement.bind(document);

    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreateElement(tag);
      if (tag === 'a') {
        vi.spyOn(el, 'click').mockImplementation(clickSpy);
      }
      return el;
    });

    render(
      <WritingOutputPanel
        {...defaultProps}
        output="## Summary"
      />,
    );

    const buttons = screen.getAllByRole('button');
    const downloadBtn = buttons.find((b) => b.textContent?.includes('下载'))!;
    fireEvent.click(downloadBtn);

    expect(clickSpy).toHaveBeenCalled();
  });

  it('keeps review tab as plain text rendering', () => {
    const { container } = render(
      <WritingOutputPanel
        {...defaultProps}
        activeTab="review"
        reviewContent="## Review Title\n\nSome review content"
        displayContent="## Review Title\n\nSome review content"
      />,
    );

    // Review tab content area uses max-h-[70vh]
    const reviewArea = container.querySelector('.max-h-\\[70vh\\]');
    expect(reviewArea).toBeTruthy();

    // The review tab uses whitespace-pre-wrap div, NOT ReactMarkdown
    // So there should be no h2 rendered inside the content area
    const headingsInContent = reviewArea!.querySelectorAll('h2');
    expect(headingsInContent.length).toBe(0);

    // Content is displayed as plain text
    expect(screen.getByText(/Some review content/)).toBeInTheDocument();
  });

  it('shows generating state when streaming', () => {
    render(
      <WritingOutputPanel
        {...defaultProps}
        reviewStreaming={true}
      />,
    );

    expect(screen.getByText(/正在生成/i)).toBeInTheDocument();
  });

  it('shows citations section for review tab with citations', () => {
    render(
      <WritingOutputPanel
        {...defaultProps}
        activeTab="review"
        reviewContent="Review text"
        displayContent="Review text"
        reviewCitations={{
          '1': { paper_id: 1, title: 'A Great Paper', number: 1 },
          '2': { paper_id: 2, title: 'Another Paper', number: 2 },
        }}
      />,
    );

    expect(screen.getByText(/参考文献/i)).toBeInTheDocument();
    expect(screen.getByText('A Great Paper')).toBeInTheDocument();
    expect(screen.getByText('Another Paper')).toBeInTheDocument();
  });
});
