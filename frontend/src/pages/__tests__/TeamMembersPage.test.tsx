import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import TeamMembersPage from '../project/TeamMembersPage';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ projectId: '1' }),
  };
});

describe('TeamMembersPage', () => {
  it('renders the page title', async () => {
    renderWithProviders(<TeamMembersPage />);

    await waitFor(() => {
      expect(screen.getByText(/Team Members/i)).toBeInTheDocument();
    });
  });

  it('displays the invite member button', async () => {
    renderWithProviders(<TeamMembersPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Invite/i })).toBeInTheDocument();
    });
  });
});
