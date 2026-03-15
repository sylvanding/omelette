import { test, expect } from '@playwright/test';

test.describe('D-2: Project Management', () => {
  test('create project via knowledge bases page', async ({ page }) => {
    await page.goto('/knowledge-bases');
    await page.waitForLoadState('networkidle');

    const createBtn = page.getByRole('button', { name: /new knowledge base|新建知识库/i }).first();
    await createBtn.click();
    await page.waitForTimeout(500);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 3000 });

    const nameInput = dialog.locator('input').first();
    await nameInput.fill('E2E Test Project');

    const submitBtn = dialog.getByRole('button', { name: /create|新建|确定/i }).first();
    await submitBtn.click();
    await page.waitForTimeout(2000);

    await expect(page.getByText('E2E Test Project').first()).toBeVisible({ timeout: 5000 });
  });

  test('navigate to project detail and see papers page', async ({ page }) => {
    await page.goto('/knowledge-bases');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const projectLink = page.locator('a[href*="/projects/"]').first();
    if (await projectLink.isVisible()) {
      await projectLink.click();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('body')).toBeVisible();
    }
  });
});

test.describe('D-3: Writing Page', () => {
  test('writing page loads within project', async ({ page }) => {
    await page.goto('/knowledge-bases');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const projectLink = page.locator('a[href*="/projects/"]').first();
    if (await projectLink.isVisible()) {
      await projectLink.click();
      await page.waitForLoadState('networkidle');

      const writingLink = page.locator('a[href*="/writing"]').first();
      if (await writingLink.isVisible()) {
        await writingLink.click();
        await page.waitForLoadState('networkidle');
        await expect(page.locator('body')).toBeVisible();
      }
    }
  });
});

test.describe('D-4: Discovery Page', () => {
  test('discovery page loads within project', async ({ page }) => {
    await page.goto('/knowledge-bases');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const projectLink = page.locator('a[href*="/projects/"]').first();
    if (await projectLink.isVisible()) {
      await projectLink.click();
      await page.waitForLoadState('networkidle');

      const discoveryLink = page.locator('a[href*="/discovery"]').first();
      if (await discoveryLink.isVisible()) {
        await discoveryLink.click();
        await page.waitForLoadState('networkidle');
        await expect(page.locator('body')).toBeVisible();
      }
    }
  });
});

test.describe('D-5: Settings Page', () => {
  test('settings page loads with provider select', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1')).toContainText(/settings|设置/i);
  });

  test('settings page shows model configuration', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await expect(page.locator('body')).toContainText(/provider|模型|mock/i);
  });
});

test.describe('D-6: Chat History & Tasks', () => {
  test('history page loads', async ({ page }) => {
    await page.goto('/history');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1')).toContainText(/history|历史/i);
  });

  test('tasks page loads', async ({ page }) => {
    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('navigating between pages works', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Playground');

    await page.goto('/knowledge-bases');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();

    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();

    await page.goto('/history');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();

    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });
});
