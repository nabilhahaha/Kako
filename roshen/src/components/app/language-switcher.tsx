"use client";

import { Globe } from "lucide-react";
import { useTransition } from "react";
import { LOCALES, LOCALE_COOKIE, dirOf, type Locale } from "@/lib/i18n";

/** Language picker — persists to a cookie (SSR-readable) + localStorage, then
 *  reloads so server-rendered labels and <html dir> update. */
export function LanguageSwitcher({ locale }: { locale: Locale }) {
  const [pending, startTransition] = useTransition();

  function setLocale(next: Locale) {
    if (next === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    try {
      localStorage.setItem(LOCALE_COOKIE, next);
    } catch {
      // ignore storage failures (private mode etc.)
    }
    document.documentElement.lang = next;
    document.documentElement.dir = dirOf(next);
    startTransition(() => window.location.reload());
  }

  return (
    <label className="relative inline-flex items-center">
      <Globe className="pointer-events-none absolute left-2.5 h-4 w-4 text-muted" />
      <select
        aria-label="Language"
        value={locale}
        disabled={pending}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className="appearance-none rounded-lg border border-line bg-white py-1.5 pl-8 pr-3 text-sm font-medium text-ink/80 outline-none hover:border-burgundy/30 focus:border-burgundy/40 focus:ring-2 focus:ring-burgundy/15"
      >
        {LOCALES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
