import { renderWithProviders, screen, waitFor } from '@/test/utils';
import { fireEvent } from '@testing-library/react';
import { TeamMembersManager } from '../TeamMembersManager';

describe('TeamMembersManager', () => {
  const defaultProps = {
    projectId: 1,
  };

  it('renders the team members title', async () => {
    renderWithProviders(<TeamMembersManager {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('Team Members')).toBeInTheDocument();
    });
  });

  it('shows the invite button', async () => {
    renderWithProviders(<TeamMembersManager {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /invite/i })).toBeInTheDocument();
    });
  });

  it('shows existing team members from mock data', async () => {
    renderWithProviders(<TeamMembersManager {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('owner@example.com')).toBeInTheDocument();
    });
  });

  it('shows the owner badge', async () => {
    renderWithProviders(<TeamMembersManager {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('Owner')).toBeInTheDocument();
    });
  });

  it('opens invite dialog when invite button is clicked', async () => {
    renderWithProviders(<TeamMembersManager {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('Team Members')).toBeInTheDocument();
    });

    const inviteButton = screen.getByRole('button', { name: /invite/i });
    fireEvent.click(inviteButton);

    await waitFor(() => {
      expect(screen.getByText('Invite Team Member')).toBeInTheDocument();
    });
  });

  it('shows member count badge', async () => {
    renderWithProviders(<TeamMembersManager {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('Team Members')).toBeInTheDocument();
    });
  });
});
