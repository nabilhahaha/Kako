import 'server-only';
import { cookies } from 'next/headers';
import { LOCALE_COOKIE, normalizeLocale, type Locale } from './config';
import { createT, type TFunc } from './index';

/** The active locale for the current request, from the persisted cookie. */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return normalizeLocale(store.get(LOCALE_COOKIE)?.value);
}

/** Server-side translator bound to the request locale. */
export async function getT(): Promise<{ locale: Locale; t: TFunc }> {
  const locale = await getLocale();
  return { locale, t: createT(locale) };
}
