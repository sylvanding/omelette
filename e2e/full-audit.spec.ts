import { test, expect } from '@playwright/test';

test('FULL AUDIT - comprehensive frontend check', async ({ page }) => {
  const errors: string[] = [];
  const consoleLogs: string[] = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleLogs.push(`[console:${msg.type()}] ${msg.text()}`);
    }
  });
  page.on('pageerror', err => {
    errors.push(err.message);
  });

  page.setViewportSize({ width: 1280, height: 800 });

  // 1. Test: Landing / Playground page loads
  console.log('=== 1. Playground Page ===');
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  const title = await page.title();
  console.log('Page title:', title);

  // Check main content rendered
  const bodyText = await page.locator('body').innerText();
  console.log('Body has "Playground":', bodyText.includes('Playground') || bodyText.includes('聊天') || bodyText.includes('playground'));

  // Check no JS errors
  await page.waitForTimeout(2000);
  console.log('Console errors so far:', consoleLogs.length);

  // Test chat input exists
  const chatInput = page.locator('textarea, input[type="text"]').first();
  const inputVisible = await chatInput.isVisible();
  console.log('Chat input visible:', inputVisible);

  // Test sidebar navigation exists
  const sidebarLinks = page.locator('nav a, nav button');
  const navCount = await sidebarLinks.count();
  console.log('Navigation elements:', navCount);

  // 2. Test: Papers/Library page
  console.log('\n=== 2. Papers/Library Page ===');
  // Try clicking nav to papers
  const paperLink = page.locator('a:has-text("Paper"), a:has-text("paper"), a:has-text("Library"), a:has-text("library")').first();
  if (await paperLink.isVisible().catch(() => false)) {
    await paperLink.click();
    await page.waitForTimeout(3000);
    const papersText = await page.locator('body').innerText();
    console.log('Papers page loaded, content length:', papersText.length);
    console.log('Has paper-related content:', papersText.includes('Paper') || papersText.includes('paper') || papersText.includes('库'));
  } else {
    console.log('No paper link found, trying direct URL');
    await page.goto('http://localhost:3000/papers', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const papersText = await page.locator('body').innerText();
    console.log('Papers page loaded via direct URL, content length:', papersText.length);
  }

  // 3. Test: Settings page
  console.log('\n=== 3. Settings Page ===');
  await page.goto('http://localhost:3000/settings', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const settingsText = await page.locator('body').innerText();
  console.log('Settings page loaded, content length:', settingsText.length);

  // Test dark mode toggle exists
  const themeButton = page.locator('button:has-text("dark"), button:has-text("Dark"), button:has-text("theme"), button:has-text("Theme"), [title*="theme"]').first();
  const themeVisible = await themeButton.isVisible().catch(() => false);
  console.log('Dark mode toggle visible:', themeVisible);

  // 4. Test: Analytics page
  console.log('\n=== 4. Analytics Page ===');
  await page.goto('http://localhost:3000/analytics', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const analyticsText = await page.locator('body').innerText();
  console.log('Analytics page loaded, content length:', analyticsText.length);

  // 5. Test: Discover/Discovery page
  console.log('\n=== 5. Discovery Page ===');
  await page.goto('http://localhost:3000/discovery', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const discoveryText = await page.locator('body').innerText();
  console.log('Discovery page loaded, content length:', discoveryText.length);

  // 6. Test: Writing page
  console.log('\n=== 6. Writing Page ===');
  await page.goto('http://localhost:3000/writing', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const writingText = await page.locator('body').innerText();
  console.log('Writing page loaded, content length:', writingText.length);

  // 7. Test: Feed page
  console.log('\n=== 7. Feed Page ===');
  await page.goto('http://localhost:3000/feed', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const feedText = await page.locator('body').innerText();
  console.log('Feed page loaded, content length:', feedText.length);

  // 8. Test: Timeline page
  console.log('\n=== 8. Timeline Page ===');
  await page.goto('http://localhost:3000/timeline', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const timelineText = await page.locator('body').innerText();
  console.log('Timeline page loaded, content length:', timelineText.length);

  // 9. Test: Keywords page
  console.log('\n=== 9. Keywords Page ===');
  await page.goto('http://localhost:3000/keywords', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const keywordsText = await page.locator('body').innerText();
  console.log('Keywords page loaded, content length:', keywordsText.length);

  // 10. Test: Reviews page
  console.log('\n=== 10. Reviews Page ===');
  await page.goto('http://localhost:3000/reviews', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const reviewsText = await page.locator('body').innerText();
  console.log('Reviews page loaded, content length:', reviewsText.length);

  // 11. Test: 404 page (non-existent route)
  console.log('\n=== 11. 404 Test ===');
  await page.goto('http://localhost:3000/nonexistent-page-12345', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  const notFoundText = await page.locator('body').innerText();
  console.log('404 page content:', notFoundText.substring(0, 200));

  // 12. Test: Responsive (mobile)
  console.log('\n=== 12. Mobile View Test ===');
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const mobileBody = await page.locator('body').innerText();
  console.log('Mobile view loaded, content length:', mobileBody.length);

  // Check for horizontal overflow
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  console.log('Mobile horizontal overflow:', scrollWidth > clientWidth ? 'YES (bad)' : 'No (good)');

  // 13. Collect all errors
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  console.log('\n=== FINAL RESULTS ===');
  console.log('Total JS errors:', errors.length);
  if (errors.length > 0) {
    console.log('Errors:', errors.join('\n'));
  }
  console.log('Total console errors:', consoleLogs.length);
  if (consoleLogs.length > 0) {
    console.log('Console errors:', consoleLogs.join('\n'));
  }

  // Verify dark mode works
  console.log('\n=== Dark Mode Test ===');
  const hasDarkClass = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  console.log('Root has dark class:', hasDarkClass);

  // Check if theme toggle button exists and works
  const allButtons = await page.locator('button').all();
  const themeBtn = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const themeBtn = btns.find(b =>
      b.textContent?.includes('Theme') ||
      b.textContent?.includes('Dark') ||
      b.textContent?.includes('Light') ||
      b.title?.includes('theme') ||
      b.getAttribute('aria-label')?.includes('theme') ||
      b.querySelector('svg')?.parentElement?.textContent?.match(/☀|☾|moon|sun/)
    );
    return themeBtn ? { found: true, text: themeBtn.textContent, title: themeBtn.title } : { found: false };
  });
  console.log('Theme button:', JSON.stringify(themeBtn));
});
