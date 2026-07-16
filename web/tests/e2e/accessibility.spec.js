// Automated a11y audit via axe-core, run against real rendered pages (not a
// manual code read) — catches things like insufficient color contrast,
// missing form labels, and invalid ARIA usage that a visual pass misses.
// Requires a reachable Supabase project (see golden-path.spec.js) so gym
// data actually renders; pages still load with an empty gym list otherwise.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PAGES = [
  { name: 'home', path: '/' },
  { name: 'gyms search', path: '/gyms' },
  { name: 'login', path: '/login' },
  { name: 'register', path: '/register' },
  { name: 'owner login', path: '/owner/login' },
  { name: 'city landing page', path: '/gyms/city/columbus-oh' },
];

for (const { name, path } of PAGES) {
  test(`${name} has no automatic WCAG 2.1 AA violations (light mode)`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test(`${name} has no automatic WCAG 2.1 AA violations (dark mode)`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('igym_theme', 'dark'));
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
}

test('gym detail page has no automatic WCAG 2.1 AA violations', async ({ page }) => {
  await page.goto('/gyms');
  const firstGymCard = page.locator('a[href^="/gyms/"]').first();
  await expect(firstGymCard).toBeVisible({ timeout: 15000 });
  await firstGymCard.click();
  await page.waitForLoadState('networkidle');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
});
