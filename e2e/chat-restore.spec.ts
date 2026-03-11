import { test, expect } from '@playwright/test';

test.describe('Chat History Restore', () => {
  test('history page shows conversation list', async ({ page }) => {
    await page.goto('/history');
    await expect(page.locator('h1')).toContainText(/history|历史/i);
  });

  test('invalid conversation ID shows not-found state', async ({ page }) => {
    await page.goto('/chat/999999');
    await expect(page.getByText(/not found|未找到/i)).toBeVisible({ timeout: 10000 });
  });
});
