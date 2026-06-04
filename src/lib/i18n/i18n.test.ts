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
