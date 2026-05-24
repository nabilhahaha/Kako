import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en';
import uk from './uk';
import ar from './ar';

export const SUPPORTED_LANGUAGES = ['en', 'uk', 'ar'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const STORAGE_KEY = 'jpfood-route-optimizer-lang';

const RTL_LANGUAGES: ReadonlySet<string> = new Set(['ar']);

/**
 * Returns the text direction for the currently active language.
 */
export function getDirection(lang?: string): 'ltr' | 'rtl' {
  const current = lang ?? i18n.language ?? 'en';
  return RTL_LANGUAGES.has(current) ? 'rtl' : 'ltr';
}

/**
 * Returns the stored language preference or falls back to 'en'.
 */
function getStoredLanguage(): SupportedLanguage {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED_LANGUAGES.includes(stored as SupportedLanguage)) {
      return stored as SupportedLanguage;
    }
  } catch {
    // localStorage may be unavailable (SSR, privacy mode, etc.)
  }
  return 'en';
}

i18n.use(initReactI18next).init({
  resources: {
    en,
    uk,
    ar,
  },
  lng: getStoredLanguage(),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false, // React already escapes by default
  },
  react: {
    useSuspense: false,
  },
});

// Persist language changes and update document direction
i18n.on('languageChanged', (lang: string) => {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // ignore write failures
  }

  // Update <html> dir and lang attributes for proper RTL/LTR rendering
  if (typeof document !== 'undefined') {
    document.documentElement.dir = getDirection(lang);
    document.documentElement.lang = lang;
  }
});

export default i18n;
