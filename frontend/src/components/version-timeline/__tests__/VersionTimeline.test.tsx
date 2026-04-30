import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen } from '@/test/utils';
import { fireEvent } from '@testing-library/react';
import VersionTimeline from '../VersionTimeline';
import type { PaperVersionEntry } from '@/services/api';

describe('VersionTimeline', () => {
  const mockVersions: PaperVersionEntry[] = [
    {
      id: 1,
      paper_id: 1,
      version: 1,
      source: 'auto_poll',
      doi: '10.1234/preprint',
      title: 'Preprint Version',
      abstract: 'Preprint abstract.',
      authors: null,
      journal: '',
      year: 2024,
      citation_count: 5,
      pdf_url: null,
      is_preprint: true,
      preprint_server: 'arXiv',
      diff_summary: null,
      created_at: '2024-01-15T10:00:00Z',
    },
    {
      id: 2,
      paper_id: 1,
      version: 2,
      source: 'auto_poll',
      doi: '10.1234/journal',
      title: 'Journal Version',
      abstract: 'Journal abstract.',
      authors: null,
      journal: 'Nature',
      year: 2024,
      citation_count: 25,
      pdf_url: 'https://example.com/paper.pdf',
      is_preprint: false,
      preprint_server: null,
      diff_summary: 'Title changed; Citations: 5 -> 25',
      created_at: '2024-06-20T14:30:00Z',
    },
  ];

  const defaultProps = {
    projectId: 1,
    paperId: 1,
    versions: mockVersions,
    isLoading: false,
    error: null,
    onCheckUpdates: vi.fn(),
    isCheckingUpdates: false,
  };

  it('renders version timeline with entries', () => {
    renderWithProviders(<VersionTimeline {...defaultProps} />);

    expect(screen.getByText(/Version History/i)).toBeInTheDocument();
    expect(screen.getByText('v1')).toBeInTheDocument();
    expect(screen.getByText('v2')).toBeInTheDocument();
  });

  it('shows preprint badge for preprint versions', () => {
    renderWithProviders(<VersionTimeline {...defaultProps} />);

    expect(screen.getByText('arXiv')).toBeInTheDocument();
  });

  it('shows journal badge for journal versions', () => {
    renderWithProviders(<VersionTimeline {...defaultProps} />);

    expect(screen.getAllByText(/Nature/i).length).toBeGreaterThanOrEqual(1);
  });

  it('shows diff summary when available', () => {
    renderWithProviders(<VersionTimeline {...defaultProps} />);

    expect(screen.getByText(/Title changed/i)).toBeInTheDocument();
  });

  it('shows loading spinner when loading', () => {
    renderWithProviders(
      <VersionTimeline {...defaultProps} versions={[]} isLoading />,
    );

    expect(document.querySelector('[class*="animate-spin"]')).toBeInTheDocument();
  });

  it('shows empty state when no versions', () => {
    renderWithProviders(
      <VersionTimeline {...defaultProps} versions={[]} />,
    );

    expect(screen.getByText(/No version history/i)).toBeInTheDocument();
    expect(screen.getByText(/Check for updates/i)).toBeInTheDocument();
  });

  it('shows error state when error occurs', () => {
    renderWithProviders(
      <VersionTimeline
        {...defaultProps}
        versions={[]}
        error={new Error('Failed to load')}
      />,
    );

    expect(screen.getByText(/Failed to load version history/i)).toBeInTheDocument();
  });

  it('calls onCheckUpdates when check button is clicked', () => {
    renderWithProviders(
      <VersionTimeline {...defaultProps} versions={[]} />,
    );

    fireEvent.click(screen.getByText(/Check for updates/i));
    expect(defaultProps.onCheckUpdates).toHaveBeenCalled();
  });

  it('shows citation count when present', () => {
    renderWithProviders(<VersionTimeline {...defaultProps} />);

    expect(screen.getByText('25 citations')).toBeInTheDocument();
  });

  it('shows upgrade buttons for each version', () => {
    renderWithProviders(<VersionTimeline {...defaultProps} />);

    const upgradeButtons = screen.getAllByText(/Upgrade/i);
    expect(upgradeButtons.length).toBeGreaterThanOrEqual(2);
  });
});
