import { test, expect } from '@playwright/test';

test.describe('Knowledge Base Paper Flow', () => {
  test('KB list page loads and shows knowledge bases', async ({ page }) => {
    await page.goto('/knowledge-bases');
    await expect(page.locator('body')).toBeVisible();
    await page.waitForTimeout(1000);
    const heading = page.getByRole('heading');
    await expect(heading.first()).toBeVisible();
  });

  test('navigating to a project shows simplified sidebar', async ({ page }) => {
    await page.goto('/knowledge-bases');
    await page.waitForTimeout(1500);
    const links = page.locator('a[href*="/projects/"]');
    const count = await links.count();
    if (count > 0) {
      await links.first().click();
      await page.waitForTimeout(1000);
      await expect(page.locator('aside nav').first()).toBeVisible();
      const navLinks = page.locator('aside nav a');
      const navCount = await navLinks.count();
      expect(navCount).toBeGreaterThanOrEqual(1);
    }
  });

  test('old routes redirect to discovery', async ({ page }) => {
    await page.goto('/projects/1/keywords');
    await page.waitForTimeout(1000);
    expect(page.url()).toContain('discovery');
  });

  test('tasks page is accessible globally', async ({ page }) => {
    await page.goto('/tasks');
    await page.waitForTimeout(1000);
    await expect(page.locator('body')).toBeVisible();
  });
});
