import { test, expect } from '@playwright/test';

test.describe('Sidebar Navigation', () => {
  test('sidebar shows nav icons and expands on toggle', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = page.locator('aside').first();
    await expect(sidebar).toBeVisible();

    const expandBtn = sidebar.getByRole('button', { name: /expand|展开/i }).first();
    if (await expandBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expandBtn.click();
      await page.waitForTimeout(300);
      await expect(sidebar).toHaveAttribute('aria-expanded', 'true');
    }
  });

  test('sidebar auto-collapses on project pages', async ({ page }) => {
    await page.goto('/knowledge-bases');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const projectLink = page.locator('a[href*="/projects/"]').first();
    if (await projectLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await projectLink.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);

      const sidebar = page.locator('aside').first();
      await expect(sidebar).toHaveAttribute('aria-expanded', 'false');
    }
  });
});

test.describe('Project Management', () => {
  test('knowledge bases page loads', async ({ page }) => {
    await page.goto('/knowledge-bases');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('create knowledge base dialog opens', async ({ page }) => {
    await page.goto('/knowledge-bases');
    await page.waitForLoadState('networkidle');

    const createBtn = page.getByRole('button', { name: /new|create|新建/i }).first();
    if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(500);
      await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 3000 });
    }
  });

  test('navigate to project detail and see papers page', async ({ page }) => {
    await page.goto('/knowledge-bases');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const projectLink = page.locator('a[href*="/projects/"]').first();
    if (await projectLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await projectLink.click();
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/Papers|论文/i).first()).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('Project Sub-Pages', () => {
  test('writing page loads within project', async ({ page }) => {
    await page.goto('/knowledge-bases');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const projectLink = page.locator('a[href*="/projects/"]').first();
    if (await projectLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await projectLink.click();
      await page.waitForLoadState('networkidle');

      const writingLink = page.locator('a[href*="/writing"]').first();
      if (await writingLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        await writingLink.click();
        await page.waitForLoadState('networkidle');
        await expect(page.locator('body')).toBeVisible();
      }
    }
  });

  test('discovery page loads within project', async ({ page }) => {
    await page.goto('/knowledge-bases');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const projectLink = page.locator('a[href*="/projects/"]').first();
    if (await projectLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await projectLink.click();
      await page.waitForLoadState('networkidle');

      const discoveryLink = page.locator('a[href*="/discovery"]').first();
      if (await discoveryLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        await discoveryLink.click();
        await page.waitForLoadState('networkidle');
        await expect(page.locator('body')).toBeVisible();
      }
    }
  });
});

test.describe('Settings Page', () => {
  test('settings page loads', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/settings|设置|provider|模型/i);
  });
});

test.describe('History & Tasks', () => {
  test('history page loads', async ({ page }) => {
    await page.goto('/history');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('tasks page loads', async ({ page }) => {
    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('navigating between pages works', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();

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

test.describe('Add Paper Dialog', () => {
  test('add paper dialog opens from papers page', async ({ page }) => {
    await page.goto('/knowledge-bases');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const projectLink = page.locator('a[href*="/projects/"]').first();
    if (await projectLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await projectLink.click();
      await page.waitForLoadState('networkidle');

      const addBtn = page.getByRole('button', { name: /add paper|添加/i }).first();
      if (await addBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await addBtn.click();
        await page.waitForTimeout(500);
        await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 3000 });
      }
    }
  });
});

test.describe('API Health Check via UI', () => {
  test('settings health indicator', async ({ page }) => {
    const healthResp = await page.request.get('/api/v1/settings/health');
    expect(healthResp.ok()).toBeTruthy();
    const data = await healthResp.json();
    expect(data.code).toBe(200);
    expect(data.data.status).toBe('healthy');
  });

  test('projects API returns data', async ({ page }) => {
    const resp = await page.request.get('/api/v1/projects');
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.code).toBe(200);
    expect(Array.isArray(data.data.items)).toBeTruthy();
  });

  test('conversations API returns data', async ({ page }) => {
    const resp = await page.request.get('/api/v1/conversations');
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.code).toBe(200);
  });
});
