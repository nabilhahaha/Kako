import { test, expect } from '@playwright/test';

/**
 * Smoke suite — runs against the app booted with PLACEHOLDER Supabase env
 * (see playwright.config.ts webServer.env). No real database or auth needed:
 * we exercise public pages, i18n direction toggling, and the unauthenticated
 * auth-gate redirect.
 */

test.describe('AMS smoke', () => {
  test('landing page returns 200 and shows brand text', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    // Brand wordmark appears across the landing page (header logo + footer copyright).
    await expect(page.getByText('AMS').first()).toBeVisible();
  });

  test('login renders form + language toggle, defaults to rtl', async ({ page }) => {
    await page.goto('/login');

    // Default locale is Arabic → document direction is RTL.
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    // Login form fields (email + password) and the submit button render.
    await expect(page.locator('input#email')).toBeVisible();
    await expect(page.locator('input#password')).toBeVisible();

    // Language toggle button: by default (Arabic active) it offers "English".
    await expect(page.getByRole('button', { name: 'English' })).toBeVisible();
  });

  test('i18n: toggling language flips dir and swaps strings', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    // Switch to English.
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    // English login submit label ("Sign in") becomes visible.
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    // Toggle now offers Arabic.
    await expect(page.getByRole('button', { name: 'العربية' })).toBeVisible();

    // Switch back to Arabic.
    await page.getByRole('button', { name: 'العربية' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('button', { name: 'English' })).toBeVisible();
  });

  test('auth gate: /dashboard redirects unauthenticated user to /login', async ({ page }) => {
    await page.goto('/dashboard');
    // Middleware finds no session (placeholder backend returns no user) and
    // redirects protected routes to /login.
    await expect(page).toHaveURL(/\/login$/);
  });
});
