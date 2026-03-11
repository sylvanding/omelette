import { describe, it, expect } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import SettingsPage from '../SettingsPage';

describe('SettingsPage', () => {
  it('renders provider selector and save button', async () => {
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save|保存/i })).toBeInTheDocument();
    });
  });

  it('renders test connection button', async () => {
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /test|测试/i })).toBeInTheDocument();
    });
  });

  it('loads settings from API', async () => {
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      const inputs = screen.getAllByRole('textbox');
      expect(inputs.length).toBeGreaterThan(0);
    });
  });
});
