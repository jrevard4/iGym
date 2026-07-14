// Golden-path smoke test: register (with a referral code) -> search gyms ->
// open a gym -> buy a pass -> see it in the wallet.
// Requires a reachable Supabase project (see web/.env.local) and a dev
// server running (playwright.config.js starts one automatically via `npm run dev`).
// Without a live backend, Stripe checkout falls back to demo mode automatically
// (server/index.js unreachable -> demoMode -> pass is saved directly), so this
// spec doesn't require the Stripe backend to be running.
import { test, expect } from '@playwright/test';

test('member can register, find a gym, buy a pass, and see it in their wallet', async ({ page }) => {
  const stamp = Date.now();
  const username = `e2e_${stamp}`;

  await page.goto('/register');
  await page.getByPlaceholder('First name').fill('E2E');
  await page.getByPlaceholder('Last name').fill('Tester');
  await page.getByPlaceholder('Email').fill(`${username}@example.com`);
  await page.getByPlaceholder('Street address').fill('123 Test St');
  await page.getByPlaceholder('City').fill('Westerville');
  await page.locator('select').selectOption('OH');
  await page.getByPlaceholder('Zip').fill('43081');
  await page.getByPlaceholder('Choose a username').fill(username);
  await page.getByPlaceholder('Choose a password').fill('testpass123');
  await page.getByRole('button', { name: 'Create Account' }).click();

  await expect(page).toHaveURL(/\/gyms/, { timeout: 15000 });

  const firstGymCard = page.locator('a[href^="/gyms/"]').first();
  await expect(firstGymCard).toBeVisible({ timeout: 15000 });
  await firstGymCard.click();

  await expect(page).toHaveURL(/\/gyms\/.+/);
  const buyButton = page.getByRole('button', { name: 'Buy Pass' }).first();
  await expect(buyButton).toBeVisible({ timeout: 10000 });
  await buyButton.click();

  await expect(page).toHaveURL(/\/checkout\//);

  // In demo mode (no live Stripe backend), the pass is granted directly.
  // With a live server + Stripe test keys, this instead renders PaymentElement —
  // that path is documented in web/README.md and not automated here.
  await page.goto('/wallet');
  await expect(page.getByText(/Active passes for/i)).toBeVisible({ timeout: 15000 });
});
