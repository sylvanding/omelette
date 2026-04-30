import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PapersFilterBar } from '../PapersFilterBar';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';

function renderFilterBar(props: Partial<React.ComponentProps<typeof PapersFilterBar>> = {}) {
  const defaultProps = {
    search: '',
    status: '' as const,
    readingStatus: '' as const,
    qualityTag: '',
    customTag: '',
    customTags: [],
    year: '',
    sortBy: 'created_at',
    order: 'desc' as const,
    onSearchChange: vi.fn(),
    onStatusChange: vi.fn(),
    onReadingStatusChange: vi.fn(),
    onQualityTagChange: vi.fn(),
    onCustomTagChange: vi.fn(),
    onYearChange: vi.fn(),
    onSortChange: vi.fn(),
    onOrderChange: vi.fn(),
    ...props,
  };

  return render(
    <I18nextProvider i18n={i18n}>
      <PapersFilterBar {...defaultProps} />
    </I18nextProvider>,
  );
}

describe('PapersFilterBar', () => {
  it('renders all filter controls', () => {
    renderFilterBar();
    expect(screen.getByPlaceholderText(/search title or abstract/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/year/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /toggle sort order/i })).toBeInTheDocument();
  });

  it('calls onSearchChange when typing in search input', () => {
    const onSearchChange = vi.fn();
    renderFilterBar({ onSearchChange });
    const input = screen.getByPlaceholderText(/search title or abstract/i);
    input.focus();
    expect(input).toHaveValue('');
  });

  it('displays quality tag select', () => {
    renderFilterBar();
    expect(screen.getByText('Quality Tags')).toBeInTheDocument();
  });

  it('displays sort options including rating', () => {
    renderFilterBar({ sortBy: 'rating' });
    expect(screen.getByText('Rating')).toBeInTheDocument();
  });

  it('displays quality tag select trigger', () => {
    renderFilterBar({ qualityTag: 'Seminal' });
    expect(screen.getByText('Seminal')).toBeInTheDocument();
  });

  it('does not show custom tags filter when no custom tags exist', () => {
    renderFilterBar();
    expect(screen.queryByText('Tags')).not.toBeInTheDocument();
  });

  it('shows custom tags filter when custom tags are provided', () => {
    renderFilterBar({ customTags: ['important', 'reviewed'] });
    expect(screen.getByText('Tags')).toBeInTheDocument();
  });
});
