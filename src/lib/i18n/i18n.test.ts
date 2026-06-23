import { describe, it, expect } from 'vitest';
import { translate, createT } from './index';
import { normalizeLocale, LOCALE_DIR } from './config';
import { DICTIONARIES } from './dictionaries';

describe('normalizeLocale', () => {
  it('defaults unknown values to Arabic', () => {
    expect(normalizeLocale(undefined)).toBe('ar');
    expect(normalizeLocale(null)).toBe('ar');
    expect(normalizeLocale('fr')).toBe('ar');
    expect(normalizeLocale('en')).toBe('en');
  });
});

describe('LOCALE_DIR', () => {
  it('maps locales to writing direction', () => {
    expect(LOCALE_DIR.ar).toBe('rtl');
    expect(LOCALE_DIR.en).toBe('ltr');
  });
});

describe('translate', () => {
  it('resolves nested dot-path keys per locale', () => {
    expect(translate('ar', 'common.signOut')).toBe('تسجيل الخروج');
    expect(translate('en', 'common.signOut')).toBe('Sign out');
    expect(translate('en', 'nav.items.dashboard')).toBe('Dashboard');
  });

  it('interpolates {param} placeholders', () => {
    expect(translate('en', 'dashboard.welcome', { name: 'Sara' })).toBe('Hi Sara 👋');
    expect(translate('en', 'subscription.expiringSoon', { days: 3 })).toContain('3');
  });

  it('falls back to the key when missing', () => {
    expect(translate('en', 'does.not.exist')).toBe('does.not.exist');
  });

  it('createT binds a locale', () => {
    const t = createT('en');
    expect(t('common.search')).toBe('Search');
  });
});

// Regression guard: the My Nearby Customers radius must come from ONE source of truth.
// The header banner, the empty state, and the server filter all use the same configured
// `radiusM`, so the radius-bearing strings must be {n}-parametrized — never a hardcoded
// number (the bug where the header said "1000 m" but the empty state still said "50 m").
describe('rpVerify radius strings are parametrized (single source of truth)', () => {
  for (const locale of ['en', 'ar'] as const) {
    it(`${locale}: showingWithin + emptyTitle interpolate {n} and hold no hardcoded radius`, () => {
      for (const key of ['rpVerify.showingWithin', 'rpVerify.emptyTitle']) {
        const at1000 = translate(locale, key, { n: 1000 });
        expect(at1000).toContain('1000');     // reflects the configured radius
        expect(at1000).not.toMatch(/\b50\b/); // no stale Latin-digit 50
        expect(at1000).not.toContain('٥٠');   // no stale Arabic-digit 50
      }
    });
  }

  it('en: empty state reads "No customers within 1000 m" when radius=1000', () => {
    expect(translate('en', 'rpVerify.emptyTitle', { n: 1000 })).toBe('No customers within 1000 m');
  });
});

describe('dictionaries parity', () => {
  it('ar and en expose the same key paths', () => {
    const paths = (obj: Record<string, unknown>, prefix = ''): string[] =>
      Object.entries(obj).flatMap(([k, v]) =>
        v && typeof v === 'object'
          ? paths(v as Record<string, unknown>, `${prefix}${k}.`)
          : [`${prefix}${k}`],
      );
    expect(paths(DICTIONARIES.en).sort()).toEqual(paths(DICTIONARIES.ar).sort());
  });
});
