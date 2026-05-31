import { DICTIONARIES, type Messages } from './dictionaries';
import { DEFAULT_LOCALE, type Locale } from './config';

export type { Locale } from './config';
export { LOCALES, DEFAULT_LOCALE, LOCALE_DIR, LOCALE_LABEL, INTL_LOCALE, LOCALE_COOKIE, normalizeLocale } from './config';

export function getMessages(locale: Locale): Messages {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}

/** Resolve a dot-path key against the catalog, with `{param}` interpolation.
 *  Falls back to the key itself if missing (so untranslated strings are visible). */
export function translate(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>,
): string {
  const msgs = getMessages(locale);
  const value = key.split('.').reduce<unknown>(
    (acc, part) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined),
    msgs,
  );
  let str = typeof value === 'string' ? value : key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return str;
}

export type TFunc = (key: string, params?: Record<string, string | number>) => string;

export function createT(locale: Locale): TFunc {
  return (key, params) => translate(locale, key, params);
}
