import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en';
import uk from './locales/uk';
import ar from './locales/ar';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      uk: { translation: uk },
      ar: { translation: ar },
    },
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

export default i18n;

export function isRTL(lang: string): boolean {
  return lang === 'ar';
}

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', dir: 'ltr' as const },
  { code: 'uk', label: 'Українська', dir: 'ltr' as const },
  { code: 'ar', label: 'العربية', dir: 'rtl' as const },
];
