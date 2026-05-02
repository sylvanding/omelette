import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import { BibliographyBuilderDialog } from '../BibliographyBuilderDialog';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ projectId: '1' }),
  };
});

describe('BibliographyBuilderDialog', () => {
  it('renders the dialog title', async () => {
    renderWithProviders(
      <BibliographyBuilderDialog projectId={1} onClose={() => {}} />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Bibliography Builder/i)).toBeInTheDocument();
    });
  });

  it('displays the paper selection counter', async () => {
    renderWithProviders(
      <BibliographyBuilderDialog projectId={1} onClose={() => {}} />,
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Select Papers/i).length).toBeGreaterThan(0);
    });
  });

  it('shows the citation style picker', async () => {
    renderWithProviders(
      <BibliographyBuilderDialog projectId={1} onClose={() => {}} />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'APA' })).toBeInTheDocument();
    });
  });

  it('shows the generate button', async () => {
    renderWithProviders(
      <BibliographyBuilderDialog projectId={1} onClose={() => {}} />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Generate Bibliography/i })).toBeInTheDocument();
    });
  });

  it('shows output panel', async () => {
    renderWithProviders(
      <BibliographyBuilderDialog projectId={1} onClose={() => {}} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Output')).toBeInTheDocument();
    });
  });

  it('shows export tabs (Formatted, BibTeX, RIS)', async () => {
    renderWithProviders(
      <BibliographyBuilderDialog projectId={1} onClose={() => {}} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Formatted')).toBeInTheDocument();
      expect(screen.getByText('BibTeX')).toBeInTheDocument();
      expect(screen.getByText('RIS')).toBeInTheDocument();
    });
  });

  it('shows select all button', async () => {
    renderWithProviders(
      <BibliographyBuilderDialog projectId={1} onClose={() => {}} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Select All')).toBeInTheDocument();
    });
  });
});
