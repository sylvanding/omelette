import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import { AuthorNetworkDialog } from '../AuthorNetworkDialog';

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
    transform: vi.fn().mockReturnThis(),
  })),
  zoomIdentity: { translate: vi.fn(() => ({ scale: vi.fn(() => ({})) })) },
}));

vi.mock('d3-scale', () => ({
  scaleLinear: vi.fn(() => ({
    domain: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
  })),
}));

vi.mock('@/design-tokens/tokens', () => ({
  getCSSVariable: vi.fn(() => '#3b82f6'),
}));

describe('AuthorNetworkDialog', () => {
  const defaultProps = {
    projectId: 1,
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the dialog title', () => {
    renderWithProviders(<AuthorNetworkDialog {...defaultProps} />);

    expect(screen.getByText(/Author collaboration network/i)).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    renderWithProviders(<AuthorNetworkDialog {...defaultProps} />);

    expect(screen.getByText(/Building author network/i)).toBeInTheDocument();
  });

  it('displays graph data after loading', async () => {
    renderWithProviders(<AuthorNetworkDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/3 authors/i)).toBeInTheDocument();
    });
  });

  it('shows collaboration badges after loading', async () => {
    renderWithProviders(<AuthorNetworkDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/2 collaborations/i)).toBeInTheDocument();
    });
  });

  it('shows density metric after loading', async () => {
    renderWithProviders(<AuthorNetworkDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/Density/i)).toBeInTheDocument();
    });
  });

  it('shows export button', async () => {
    renderWithProviders(<AuthorNetworkDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Export PNG/i })).toBeInTheDocument();
    });
  });

  it('renders SVG element after loading', async () => {
    renderWithProviders(<AuthorNetworkDialog {...defaultProps} />);

    await waitFor(() => {
      expect(document.querySelector('svg')).toBeInTheDocument();
    });
  });
});
