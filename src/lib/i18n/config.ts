/** Supported UI locales. Arabic is the default; English is the toggle target. */
export const LOCALES = ['ar', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'ar';

/** Cookie the chosen locale is persisted in (read server-side for SSR, written
 *  client-side when the user toggles). One year, lax. */
export const LOCALE_COOKIE = 'ams_locale';
export const LOCALE_MAX_AGE = 60 * 60 * 24 * 365;

/** Writing direction per locale — drives `<html dir>` and RTL/LTR layout. */
export const LOCALE_DIR: Record<Locale, 'rtl' | 'ltr'> = { ar: 'rtl', en: 'ltr' };

/** Human label for the language switcher (each shown in its own script). */
export const LOCALE_LABEL: Record<Locale, string> = { ar: 'العربية', en: 'English' };

/** BCP-47 tag for Intl number/date/currency formatting. */
export const INTL_LOCALE: Record<Locale, string> = { ar: 'ar-EG', en: 'en-US' };

export function normalizeLocale(value?: string | null): Locale {
  return value === 'en' ? 'en' : 'ar';
}
