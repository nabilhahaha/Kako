import { test, expect } from '@playwright/test';

/**
 * Smoke suite — runs against the app booted with PLACEHOLDER Supabase env
 * (see playwright.config.ts webServer.env). No real database or auth needed:
 * we exercise public pages, the login modal, i18n direction toggling, and the
 * unauthenticated auth-gate redirect.
 */

test.describe('Velora smoke', () => {
  test('landing page returns 200 and shows brand, defaults to rtl', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    // Brand wordmark (header logo) renders.
    await expect(page.getByText('Velora').first()).toBeVisible();
    // Default locale is Arabic → document direction is RTL.
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  });

  test('login modal opens from the nav and renders the form', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'دخول' }).click();
    await expect(page.locator('input#email')).toBeVisible();
    await expect(page.locator('input#password')).toBeVisible();
  });

  test('deep-link /login opens the modal on the landing page', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/\?login=1$/);
    await expect(page.locator('input#email')).toBeVisible();
  });

  test('i18n: toggling language flips dir and swaps strings', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    // Switch to English.
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    // English nav login label becomes visible.
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
    // Toggle now offers Arabic.
    await expect(page.getByRole('button', { name: 'العربية' })).toBeVisible();

    // Switch back to Arabic.
    await page.getByRole('button', { name: 'العربية' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('button', { name: 'English' })).toBeVisible();
  });

  test('auth gate: /dashboard redirects unauthenticated user to login', async ({ page }) => {
    await page.goto('/dashboard');
    // Middleware finds no session and redirects protected routes to /login,
    // which in turn opens the login modal on the landing page.
    await expect(page).toHaveURL(/\/(login|\?login=1)$/);
  });
});
