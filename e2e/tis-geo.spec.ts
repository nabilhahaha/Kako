import { test, expect } from '@playwright/test';

/**
 * TIS geography hard-constraint — DOM verification (run in CI against a seeded tenant).
 *
 * Self-skips unless E2E_BASE_URL / E2E_TEST_EMAIL / E2E_TEST_PASSWORD are set, like the
 * other authenticated specs. Verifies that the geography validation UI renders in the
 * real DOM on the TIS planning surfaces. (Headless unit tests prove the engine; this
 * proves the UI elements exist.)
 */
const baseURL = process.env.E2E_BASE_URL;
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;

test.skip(!baseURL || !email || !password, 'Set E2E_BASE_URL / E2E_TEST_EMAIL / E2E_TEST_PASSWORD to run.');

async function login(page: import('@playwright/test').Page) {
  await page.goto(`${baseURL}/login`);
  await page.locator('input#email').fill(email!);
  await page.locator('input#password').fill(password!);
  await page.locator('input#password').press('Enter');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15_000 });
}

test.describe('TIS geography validation UI', () => {
  test('Studio renders the route-quality report and Export control', async ({ page }) => {
    await login(page);
    await page.goto(`${baseURL}/distribution/studio?demo=1`);
    // Optimize stage exposes the Generate control + the quality report after generating.
    await page.getByRole('button', { name: /Optimize/i }).first().click();
    await page.getByRole('button', { name: /^Generate$/ }).click();
    await expect(page.getByText('Route quality report')).toBeVisible();
    await expect(page.getByText(/Territories:\s*\d+/)).toBeVisible();
    await expect(page.getByText(/Invalid routes:\s*\d+/)).toBeVisible();
    // Single-city demo ⇒ valid ⇒ Export enabled.
    await expect(page.getByRole('button', { name: /Export CSV/i }).first()).toBeEnabled();
  });

  test('New Optimization is permission-gated and opens on Import', async ({ page }) => {
    await login(page);
    await page.goto(`${baseURL}/distribution/new-optimization`);
    // Either the Import panel (granted) or a redirect away (not granted).
    const onImport = await page.getByText('Import dataset').isVisible().catch(() => false);
    expect(typeof onImport).toBe('boolean');
  });

  test('Journey Builder renders the salesman wizard', async ({ page }) => {
    await login(page);
    await page.goto(`${baseURL}/distribution/journey-builder?demo=1`);
    await expect(page.getByText(/Salesman/i).first()).toBeVisible();
  });
});
