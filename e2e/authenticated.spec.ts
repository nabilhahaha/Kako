import { test, expect } from '@playwright/test';

/**
 * Authenticated flows — DOCUMENTED PLACEHOLDER.
 *
 * These require a reachable app pointed at a real (seeded) Supabase tenant and
 * working credentials. They self-skip unless ALL of the following are set:
 *   - E2E_BASE_URL        e.g. https://staging.example.com
 *   - E2E_TEST_EMAIL      a seeded test-tenant login
 *   - E2E_TEST_PASSWORD
 *
 * Until a seeded test tenant exists this whole file is skipped (not failing),
 * so the default `npm run test:e2e` stays green.
 */
const baseURL = process.env.E2E_BASE_URL;
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;

test.skip(
  !baseURL || !email || !password,
  'Set E2E_BASE_URL, E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated flows against a seeded tenant.',
);

test.describe('Velora authenticated', () => {
  test('UI login lands on an authenticated home', async ({ page }) => {
    await page.goto(`${baseURL}/login`);

    await page.locator('input#email').fill(email!);
    await page.locator('input#password').fill(password!);
    // Works in either locale: submit by role or by Enter on the password field.
    await page.locator('input#password').press('Enter');

    // After a successful login the app routes away from /login to a role home
    // (dashboard or business-specific home). Assert we left the login page.
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
      timeout: 15_000,
    });
    await expect(page).not.toHaveURL(/\/login$/);
  });
});
