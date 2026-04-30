import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor, userEvent } from '@/test/utils';
import { usePapersColumns } from '../papers-columns';
import { DataTable } from '@/components/ui/data-table';
import type { Paper } from '@/types';

function mockPaper(overrides?: Partial<Paper>): Paper {
  return {
    id: 1,
    title: 'Test Paper',
    status: 'indexed',
    reading_status: 'unread',
    rating: 0,
    quality_tags: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

interface TestHarnessProps {
  papers: Paper[];
  onReadingStatusChange?: (id: number, status: string) => void;
}

function TestHarness({ papers, onReadingStatusChange }: TestHarnessProps) {
  const columns = usePapersColumns({
    pid: 1,
    deleteMutation: { isPending: false, mutate: vi.fn() },
    handleRetry: vi.fn(),
    setGraphPaperId: vi.fn(),
    onReadingStatusChange,
  });

  return <DataTable<Paper> columns={columns} data={papers} getRowId={(row) => row.id} />;
}

function renderColumns(papers: Paper[], onReadingStatusChange?: (id: number, status: string) => void) {
  renderWithProviders(<TestHarness papers={papers} onReadingStatusChange={onReadingStatusChange} />);
}

describe('Inline reading status editor', () => {
  it('renders reading status as a clickable button', () => {
    const paper = mockPaper({ reading_status: 'unread' });
    renderColumns([paper]);

    const button = screen.getByRole('button', { name: /change reading status/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Unread');
  });

  it('shows Reading label when status is reading', () => {
    const paper = mockPaper({ reading_status: 'reading', id: 100 });
    renderColumns([paper]);

    const button = screen.getByRole('button', { name: /change reading status/i });
    expect(button).toHaveTextContent('Reading');
  });

  it('shows Read label when status is read', () => {
    const paper = mockPaper({ reading_status: 'read', id: 200 });
    renderColumns([paper]);

    const button = screen.getByRole('button', { name: /change reading status/i });
    expect(button).toHaveTextContent('Read');
  });

  it('shows Archived label when status is archived', () => {
    const paper = mockPaper({ reading_status: 'archived', id: 300 });
    renderColumns([paper]);

    const button = screen.getByRole('button', { name: /change reading status/i });
    expect(button).toHaveTextContent('Archived');
  });

  it('opens dropdown when clicking the status button', async () => {
    const paper = mockPaper({ reading_status: 'unread', id: 1 });
    renderColumns([paper]);

    const button = screen.getByRole('button', { name: /change reading status/i });
    await userEvent.click(button);

    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('shows all four status options in dropdown', async () => {
    const paper = mockPaper({ reading_status: 'unread', id: 2 });
    renderColumns([paper]);

    const button = screen.getByRole('button', { name: /change reading status/i });
    await userEvent.click(button);

    const menu = screen.getByRole('menu');
    expect(menu).toHaveTextContent('Unread');
    expect(menu).toHaveTextContent('Reading');
    expect(menu).toHaveTextContent('Read');
    expect(menu).toHaveTextContent('Archived');
  });

  it('calls onReadingStatusChange when selecting a new status', async () => {
    const handleChange = vi.fn();
    const paper = mockPaper({ reading_status: 'unread', id: 3 });
    renderColumns([paper], handleChange);

    const button = screen.getByRole('button', { name: /change reading status/i });
    await userEvent.click(button);

    const readItem = screen.getByText('Read');
    await userEvent.click(readItem);

    await waitFor(() => {
      expect(handleChange).toHaveBeenCalledWith(3, 'read');
    });
  });
});
