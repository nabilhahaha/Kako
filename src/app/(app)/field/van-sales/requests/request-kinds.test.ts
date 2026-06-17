import { describe, it, expect } from 'vitest';
import { REQUEST_FORM_KINDS } from './request-kinds';

/**
 * Regression guard for the dedicated-screen route. REQUEST_FORM_KINDS MUST live in
 * a plain (non-'use client') module so the Server Component
 * `requests/[type]/page.tsx` can use it as a REAL array. If it is exported from a
 * 'use client' module, importing it into the server route turns it into a client
 * reference and `.includes()` throws at render (the generic-error-page regression).
 */
describe('REQUEST_FORM_KINDS (plain module, server-safe)', () => {
  it('is a real array usable with .includes() (not a client reference)', () => {
    expect(Array.isArray(REQUEST_FORM_KINDS)).toBe(true);
    expect(typeof REQUEST_FORM_KINDS.includes).toBe('function');
    expect(REQUEST_FORM_KINDS.includes('close')).toBe(true);
    expect(REQUEST_FORM_KINDS.includes('cash' as never)).toBe(false);
  });
  it('covers exactly the eight customer request screens', () => {
    expect([...REQUEST_FORM_KINDS].sort()).toEqual(
      ['close', 'credit', 'gps', 'new', 'reactivate', 'route', 'terms', 'update'],
    );
  });
});
