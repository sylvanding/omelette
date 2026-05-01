import { test, expect } from '@playwright/test';

test.describe('Subscription Page', () => {
  test('loads subscription page and shows empty state', async ({ page }) => {
    await page.goto('/projects/1/subscriptions');
    await expect(page.locator('h1')).toContainText('Subscriptions');
    // Empty state or existing subscriptions
    const hasEmptyState = await page.locator('text=No subscriptions yet').isVisible().catch(() => false);
    const hasList = await page.locator('text=Your Subscriptions').isVisible().catch(() => false);
    expect(hasEmptyState || hasList).toBe(true);
  });

  test('shows quick update check panel', async ({ page }) => {
    await page.goto('/projects/1/subscriptions');
    await expect(page.locator('text=Quick Update Check')).toBeVisible();
    await expect(page.locator('text=Search across sources for new papers without creating a subscription')).toBeVisible();
  });

  test('has new subscription button', async ({ page }) => {
    await page.goto('/projects/1/subscriptions');
    await expect(page.locator('button:has-text("New Subscription")')).toBeVisible();
  });
});

test.describe('Pipelines Page', () => {
  test('loads pipelines page and shows pipeline executions header', async ({ page }) => {
    await page.goto('/projects/1/pipelines');
    await expect(page.locator('h1')).toContainText('Pipelines');
    await expect(page.getByRole('heading', { name: 'Pipeline Executions' })).toBeVisible();
  });

  test('shows start pipeline button', async ({ page }) => {
    await page.goto('/projects/1/pipelines');
    await expect(page.locator('button:has-text("Start Pipeline")')).toBeVisible();
  });

  test('shows search and upload pipeline tabs', async ({ page }) => {
    await page.goto('/projects/1/pipelines');
    await page.locator('button:has-text("Start Pipeline")').click();
    await expect(page.locator('text=Search Pipeline')).toBeVisible();
    await expect(page.locator('text=Upload Pipeline')).toBeVisible();
  });

  test('status cards are visible', async ({ page }) => {
    await page.goto('/projects/1/pipelines');
    await expect(page.getByText('Running', { exact: true })).toBeVisible();
    await expect(page.getByText('Interrupted', { exact: true })).toBeVisible();
    await expect(page.getByText('Completed', { exact: true })).toBeVisible();
    await expect(page.getByText('Failed', { exact: true })).toBeVisible();
  });
});
