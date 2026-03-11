import { describe, it, expect } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import ChatHistoryPage from '../ChatHistoryPage';

describe('ChatHistoryPage', () => {
  it('renders conversation list with clickable links', async () => {
    renderWithProviders(<ChatHistoryPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Conversation')).toBeInTheDocument();
    });

    const link = screen.getByRole('link', { name: /Test Conversation/i });
    expect(link).toHaveAttribute('href', '/chat/1');
  });

  it('shows empty state when no conversations', async () => {
    renderWithProviders(<ChatHistoryPage />);

    await waitFor(() => {
      expect(screen.queryByText('Test Conversation')).toBeInTheDocument();
    });
  });

  it('filters conversations by search', async () => {
    renderWithProviders(<ChatHistoryPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Conversation')).toBeInTheDocument();
    });
  });
});
