'use client';
import { createContext, useContext, useCallback, useEffect, useState, ReactNode } from 'react';
import type { L, Locale } from '@/lib/types';

interface I18n {
  lang: Locale;
  dir: 'rtl' | 'ltr';
  setLang: (l: Locale) => void;
  toggleLang: () => void;
  /** localize an { ar, en } value */
  t: (v: L | undefined) => string;
  /** inline helper — t(tt('عربي','English')) shorthand */
  tt: (ar: string, en: string) => string;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Locale>('ar');
  // restore preferred language from the last session
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('sb_lang') as Locale | null;
      if (saved === 'ar' || saved === 'en') setLang(saved);
    } catch { /* ignore */ }
  }, []);
  // keep the document root + storage in sync for assistive tech + native RTL handling
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    try { sessionStorage.setItem('sb_lang', lang); } catch { /* ignore */ }
  }, [lang]);
  const t = useCallback((v: L | undefined) => (v ? v[lang] ?? v.ar : ''), [lang]);
  const tt = useCallback((ar: string, en: string) => (lang === 'ar' ? ar : en), [lang]);
  const toggleLang = useCallback(() => setLang((p) => (p === 'ar' ? 'en' : 'ar')), []);
  const value: I18n = { lang, dir: lang === 'ar' ? 'rtl' : 'ltr', setLang, toggleLang, t, tt };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const c = useContext(Ctx);
  if (!c) throw new Error('useI18n must be used within I18nProvider');
  return c;
}
