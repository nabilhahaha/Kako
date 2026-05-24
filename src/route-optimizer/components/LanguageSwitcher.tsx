import { useTranslation } from 'react-i18next';

const languages = [
  { code: 'en', label: 'EN' },
  { code: 'uk', label: 'UK' },
  { code: 'ar', label: 'AR' },
] as const;

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  function changeLanguage(lang: string) {
    i18n.changeLanguage(lang);
    const dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.dir = dir;
    document.documentElement.lang = lang;
    localStorage.setItem('jpfood-lang', lang);
  }

  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
      {languages.map(({ code, label }) => (
        <button
          key={code}
          onClick={() => changeLanguage(code)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            i18n.language === code
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
