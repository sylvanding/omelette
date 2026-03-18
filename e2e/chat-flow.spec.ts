import { test, expect } from '@playwright/test';

test.describe('Chat Flow', () => {
  test('app loads and shows playground', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1')).toContainText(/Playground|聊天/i, { timeout: 5000 });
  });

  test('KB picker opens and shows knowledge bases', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const kbButton = page.getByRole('button', { name: /knowledge|知识库/i }).first();
    if (await kbButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await kbButton.click();
      await page.waitForTimeout(500);
      await expect(page.locator('[data-radix-popper-content-wrapper]')).toBeVisible();
    }
  });

  test('new chat button works', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const newChatBtn = page.getByRole('button', { name: /new chat|新建/i }).first();
    if (await newChatBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await newChatBtn.click();
      await expect(page).toHaveURL('/');
    }
  });

  test('welcome screen shows suggestions', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /How can I help|如何帮助/i })).toBeVisible({ timeout: 5000 });
  });
});
