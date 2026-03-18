import { test, expect } from '@playwright/test';

test('app loads and shows playground', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText(/Playground|聊天/i);
});
