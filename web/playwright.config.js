import { defineConfig } from '@playwright/test';

// PORT lets a test run spin up its own dev server on a free port instead of
// colliding with one already running on 3000 (e.g. a developer's own `npm
// run dev` session) — defaults to 3000 so normal local usage is unchanged.
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 60000,
  },
});
