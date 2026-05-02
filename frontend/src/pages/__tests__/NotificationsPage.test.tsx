import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import NotificationsPage from '../project/NotificationsPage';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ projectId: '1' }),
  };
});

describe('NotificationsPage', () => {
  it('renders the page title', async () => {
    renderWithProviders(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Notifications/i)).toBeInTheDocument();
    });
  });

  it('displays notification cards', async () => {
    renderWithProviders(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText(/New paper: Deep Learning in NLP/i)).toBeInTheDocument();
    });
  });

  it('shows unread count', async () => {
    renderWithProviders(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText(/2 unread/i)).toBeInTheDocument();
    });
  });

  it('displays the mark all read button when there are unread', async () => {
    renderWithProviders(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Mark all read/i })).toBeInTheDocument();
    });
  });

  it('shows notification body text', async () => {
    renderWithProviders(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText(/A new paper matching your subscription/i)).toBeInTheDocument();
    });
  });

  it('shows type badges for notifications', async () => {
    renderWithProviders(<NotificationsPage />);

    await waitFor(() => {
      // The badge shows the type label — multiple notifications share the same type
      const badges = screen.getAllByText('Subscription Match');
      expect(badges.length).toBeGreaterThanOrEqual(1);
    });
  });
});
