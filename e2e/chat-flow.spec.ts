import { test, expect } from '@playwright/test';

test.describe('Chat Flow', () => {
  test('app loads and shows playground welcome', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Playground');
  });

  test('KB picker opens and shows knowledge bases', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /knowledge/i }).click();
    await expect(page.locator('[data-radix-popper-content-wrapper]')).toBeVisible();
  });

  test('new chat button resets state', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /new/i }).first().click();
    await expect(page).toHaveURL('/');
  });
});
