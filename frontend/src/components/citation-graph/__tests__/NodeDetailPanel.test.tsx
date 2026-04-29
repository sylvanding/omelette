import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, userEvent } from '@/test/utils';
import NodeDetailPanel from '../NodeDetailPanel';
import type { GraphNode } from '../CitationGraphView';

const mockNode: GraphNode = {
  id: 'paper-1',
  title: 'Test Paper Title',
  year: 2024,
  citation_count: 42,
  is_local: true,
  s2_id: 'abc123',
  authors: ['Alice Smith', 'Bob Jones'],
  paper_id: 10,
};

describe('NodeDetailPanel', () => {
  it('renders paper title', () => {
    renderWithProviders(
      <NodeDetailPanel node={mockNode} projectId={1} onClose={() => {}} />,
    );
    expect(screen.getByText('Test Paper Title')).toBeInTheDocument();
  });

  it('shows year badge', () => {
    renderWithProviders(
      <NodeDetailPanel node={mockNode} projectId={1} onClose={() => {}} />,
    );
    expect(screen.getByText('2024')).toBeInTheDocument();
  });

  it('shows citation count', () => {
    renderWithProviders(
      <NodeDetailPanel node={mockNode} projectId={1} onClose={() => {}} />,
    );
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('shows authors', () => {
    renderWithProviders(
      <NodeDetailPanel node={mockNode} projectId={1} onClose={() => {}} />,
    );
    expect(screen.getByText('Alice Smith, Bob Jones')).toBeInTheDocument();
  });

  it('shows local badge for local papers', () => {
    renderWithProviders(
      <NodeDetailPanel node={mockNode} projectId={1} onClose={() => {}} />,
    );
    expect(screen.getByText('已在知识库中')).toBeInTheDocument();
  });

  it('shows view paper button for local papers with paper_id', () => {
    renderWithProviders(
      <NodeDetailPanel node={mockNode} projectId={1} onClose={() => {}} />,
    );
    expect(screen.getByText(/查看论文/)).toBeInTheDocument();
  });

  it('shows Semantic Scholar link', () => {
    renderWithProviders(
      <NodeDetailPanel node={mockNode} projectId={1} onClose={() => {}} />,
    );
    const s2Link = screen.getByRole('link', { name: /在 Semantic Scholar/ });
    expect(s2Link).toHaveAttribute('href', 'https://www.semanticscholar.org/paper/abc123');
    expect(s2Link).toHaveAttribute('target', '_blank');
  });

  it('calls onClose when close button clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(
      <NodeDetailPanel node={mockNode} projectId={1} onClose={onClose} />,
    );
    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('does not show year when null', () => {
    renderWithProviders(
      <NodeDetailPanel
        node={{ ...mockNode, year: null }}
        projectId={1}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByText('2024')).not.toBeInTheDocument();
  });

  it('does not show authors when empty', () => {
    renderWithProviders(
      <NodeDetailPanel
        node={{ ...mockNode, authors: undefined }}
        projectId={1}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByText('Alice Smith, Bob Jones')).not.toBeInTheDocument();
  });

  it('does not show view paper button for non-local papers', () => {
    renderWithProviders(
      <NodeDetailPanel
        node={{ ...mockNode, is_local: false }}
        projectId={1}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByText(/查看论文/)).not.toBeInTheDocument();
  });
});
