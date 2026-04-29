import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen } from '@/test/utils';
import CitationGraphView from '../CitationGraphView';
import type { GraphData } from '../CitationGraphView';

// Mock d3 modules
vi.mock('d3-force', () => ({
  forceSimulation: vi.fn(() => ({
    force: vi.fn().mockReturnThis(),
    id: vi.fn().mockReturnThis(),
    distance: vi.fn().mockReturnThis(),
    strength: vi.fn().mockReturnThis(),
    alphaMin: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    stop: vi.fn(),
    alphaTarget: vi.fn().mockReturnThis(),
    restart: vi.fn(),
  })),
  forceLink: vi.fn(() => ({
    id: vi.fn().mockReturnThis(),
    distance: vi.fn().mockReturnThis(),
    strength: vi.fn().mockReturnThis(),
  })),
  forceManyBody: vi.fn(() => ({
    strength: vi.fn().mockReturnThis(),
    theta: vi.fn().mockReturnThis(),
  })),
  forceCenter: vi.fn(() => ({})),
  forceCollide: vi.fn(() => ({
    radius: vi.fn().mockReturnThis(),
  })),
}));

vi.mock('d3-selection', () => ({
  select: vi.fn(() => ({
    attr: vi.fn().mockReturnThis(),
    selectAll: vi.fn().mockReturnThis(),
    remove: vi.fn().mockReturnThis(),
    append: vi.fn().mockReturnThis(),
    call: vi.fn().mockReturnThis(),
    join: vi.fn().mockReturnThis(),
    data: vi.fn().mockReturnThis(),
    text: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
  })),
}));

vi.mock('d3-drag', () => ({
  drag: vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
  })),
}));

vi.mock('d3-zoom', () => ({
  zoom: vi.fn(() => ({
    scaleExtent: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    transform: vi.fn(),
  })),
  zoomIdentity: { translate: vi.fn(() => ({})) },
}));

vi.mock('@/design-tokens/tokens', () => ({
  getCSSVariable: vi.fn(() => '#3b82f6'),
}));

const mockGraphData: GraphData = {
  nodes: [
    {
      id: 'paper-1',
      title: 'Center Paper',
      year: 2024,
      citation_count: 100,
      is_local: true,
      s2_id: 'abc123',
      paper_id: 1,
    },
    {
      id: 'paper-2',
      title: 'Referenced Paper',
      year: 2020,
      citation_count: 50,
      is_local: false,
      s2_id: 'def456',
    },
  ],
  edges: [
    { source: 'paper-1', target: 'paper-2', type: 'cites' as const },
  ],
  center_id: 'paper-1',
};

describe('CitationGraphView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading skeleton when isLoading is true', () => {
    renderWithProviders(
      <CitationGraphView data={mockGraphData} isLoading projectId={1} />,
    );
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows error message when data has error', () => {
    const errorData = { ...mockGraphData, error: 'Something went wrong' };
    renderWithProviders(
      <CitationGraphView data={errorData} projectId={1} />,
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('shows empty state when no nodes', () => {
    renderWithProviders(
      <CitationGraphView
        data={{ ...mockGraphData, nodes: [] }}
        projectId={1}
      />,
    );
    expect(screen.getByText(/No citation data/)).toBeInTheDocument();
  });

  it('shows node and edge count badges', () => {
    renderWithProviders(
      <CitationGraphView data={mockGraphData} projectId={1} />,
    );
    expect(screen.getByText('2 nodes')).toBeInTheDocument();
    expect(screen.getByText('1 edges')).toBeInTheDocument();
  });

  it('shows local count badge when there are local papers', () => {
    renderWithProviders(
      <CitationGraphView data={mockGraphData} projectId={1} />,
    );
    expect(screen.getByText('1 local')).toBeInTheDocument();
  });

  it('shows legend with color indicators', () => {
    renderWithProviders(
      <CitationGraphView data={mockGraphData} projectId={1} />,
    );
    // Legend is in bottom-right corner with color swatches
    const legendContainer = document.querySelector('.bottom-3.right-3');
    expect(legendContainer).toBeInTheDocument();
    const swatches = legendContainer?.querySelectorAll('.rounded-full.bg-primary, .rounded-full.bg-emerald-500');
    expect(swatches!.length).toBeGreaterThanOrEqual(2);
  });

  it('shows filter button', () => {
    renderWithProviders(
      <CitationGraphView data={mockGraphData} projectId={1} />,
    );
    expect(screen.getByText(/Local only/)).toBeInTheDocument();
  });

  it('renders SVG element', () => {
    renderWithProviders(
      <CitationGraphView data={mockGraphData} projectId={1} />,
    );
    expect(document.querySelector('svg')).toBeInTheDocument();
  });
});
