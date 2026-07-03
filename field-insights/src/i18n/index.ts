import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
  en: {
    translation: {
      app: { name: 'Field Insights' },
      nav: { home: 'Home', visits: 'Visits', map: 'Map', dashboards: 'Dashboards', more: 'More' },
      home: {
        greeting: 'Welcome',
        startVisit: 'Start Visit',
        todaysVisits: "Today's visits",
        actionsDue: 'Actions due',
      },
      common: { offline: 'Offline', online: 'Online', pending: 'Pending sync' },
    },
  },
  ar: {
    translation: {
      app: { name: 'فيلد إنسايتس' },
      nav: { home: 'الرئيسية', visits: 'الزيارات', map: 'الخريطة', dashboards: 'لوحات', more: 'المزيد' },
      home: {
        greeting: 'مرحبا',
        startVisit: 'بدء زيارة',
        todaysVisits: 'زيارات اليوم',
        actionsDue: 'إجراءات مستحقة',
      },
      common: { offline: 'غير متصل', online: 'متصل', pending: 'بانتظار المزامنة' },
    },
  },
};

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    detection: { caches: ['localStorage'], lookupLocalStorage: 'fi-lang' },
  });

export default i18n;
