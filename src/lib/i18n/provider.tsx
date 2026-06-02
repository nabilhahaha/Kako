'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  LOCALE_COOKIE,
  LOCALE_DIR,
  LOCALE_MAX_AGE,
  type Locale,
} from './config';
import { createT, type TFunc } from './index';

interface I18nValue {
  locale: Locale;
  dir: 'rtl' | 'ltr';
  t: TFunc;
  setLocale: (next: Locale) => void;
  toggleLocale: () => void;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback(
    (next: Locale) => {
      if (next === locale) return;
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_MAX_AGE}; samesite=lax`;
      // Flip the document immediately so layout/direction update without waiting
      // for the server round-trip.
      document.documentElement.lang = next;
      document.documentElement.dir = LOCALE_DIR[next];
      setLocaleState(next);
      // Re-render server components (translated server-side) with the new locale.
      router.refresh();
    },
    [locale, router],
  );

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      dir: LOCALE_DIR[locale],
      t: createT(locale),
      setLocale,
      toggleLocale: () => setLocale(locale === 'ar' ? 'en' : 'ar'),
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within <I18nProvider>');
  return ctx;
}

/** Convenience: just the translator. */
export function useT(): TFunc {
  return useI18n().t;
}
