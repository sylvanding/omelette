import { describe, it, expect } from 'vitest';
import { renderWithProviders, screen } from '@/test/utils';
import { ImpactScoreBadge } from '../ImpactScoreBadge';
import type { ImpactFactor } from '@/services/api';

const mockFactors: Record<string, ImpactFactor> = {
  citations: { raw: 150, normalized: 0.8, weight: 0.3 },
  recency: { year: 2024, normalized: 0.9, weight: 0.2 },
  journal: { name: 'Nature', normalized: 0.6, weight: 0.2 },
  evidence_consensus: { quality_tags: ['high_quality'], normalized: 0.7, weight: 0.15 },
  field_percentile: { percentile: 0.75, normalized: 0.75, weight: 0.15 },
};

describe('ImpactScoreBadge', () => {
  it('renders the score as a rounded integer', () => {
    renderWithProviders(<ImpactScoreBadge score={72.5} />);

    expect(screen.getByText('73')).toBeInTheDocument();
  });

  it('renders score 0', () => {
    renderWithProviders(<ImpactScoreBadge score={0} />);

    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('renders score 100', () => {
    renderWithProviders(<ImpactScoreBadge score={100} />);

    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('renders with factors without error', () => {
    renderWithProviders(<ImpactScoreBadge score={72.5} factors={mockFactors} />);

    expect(screen.getByText('73')).toBeInTheDocument();
  });

  it('uses correct color class for high scores', () => {
    renderWithProviders(<ImpactScoreBadge score={85} />);

    const badge = screen.getByText('85');
    expect(badge.className).toContain('emerald');
  });

  it('uses correct color class for medium scores', () => {
    renderWithProviders(<ImpactScoreBadge score={50} />);

    const badge = screen.getByText('50');
    expect(badge.className).toContain('amber');
  });

  it('uses correct color class for low scores', () => {
    renderWithProviders(<ImpactScoreBadge score={10} />);

    const badge = screen.getByText('10');
    expect(badge.className).toContain('muted');
  });
});
