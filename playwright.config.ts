import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E config for the AMS ERP.
 *
 * The smoke suite (e2e/smoke.spec.ts) is designed to run WITHOUT a real
 * database: the webServer boots Next.js with placeholder Supabase env so
 * public pages, i18n, and the auth-gate redirect all render/behave correctly
 * against a backend that returns no session.
 *
 * The authenticated suite (e2e/authenticated.spec.ts) self-skips unless the
 * E2E_BASE_URL / E2E_TEST_EMAIL / E2E_TEST_PASSWORD secrets are provided.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // The production build of this app takes several minutes (it nearly doubled
    // after the FMCG suite landed on main), which blows past a webServer readiness
    // timeout if the build runs here. In CI we BUILD IN A SEPARATE STEP and set
    // PW_E2E_START_ONLY=1 so this only runs `next start` (ready in <1s). Locally
    // (no flag) we still build+start, with a generous timeout.
    command: process.env.PW_E2E_START_ONLY === '1' ? 'npm run start' : 'npm run build && npm run start',
    url: 'http://localhost:3000',
    timeout: process.env.PW_E2E_START_ONLY === '1' ? 120_000 : 600_000,
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_PUBLIC_SUPABASE_URL:
        process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_placeholder',
    },
  },
});
