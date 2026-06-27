import "server-only";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, normalizeLocale, translator, dirOf, type Locale, type TFn } from "@/lib/i18n";

/** Read the locale from the request cookie (server components / actions). */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return normalizeLocale(store.get(LOCALE_COOKIE)?.value);
}

/** Convenience: resolve locale + translator + text direction in one call. */
export async function getT(): Promise<{ locale: Locale; t: TFn; dir: "ltr" | "rtl" }> {
  const locale = await getLocale();
  return { locale, t: translator(locale), dir: dirOf(locale) };
}
