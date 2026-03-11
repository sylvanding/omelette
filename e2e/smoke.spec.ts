import { test, expect } from '@playwright/test';

test('app loads and shows playground', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Playground' })).toBeVisible();
});
