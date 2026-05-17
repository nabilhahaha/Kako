import { useLang } from '../App.jsx';

export default function LanguageToggle() {
  const { lang, setLang } = useLang();
  const next = lang === 'ar' ? 'en' : 'ar';
  return (
    <button
      onClick={() => setLang(next)}
      className="bg-white/15 hover:bg-white/25 transition rounded-full px-3 h-9 flex items-center gap-1.5 text-sm font-semibold"
      aria-label="Toggle language"
    >
      <span aria-hidden>🌐</span>
      <span>{lang === 'ar' ? 'EN' : 'عربي'}</span>
    </button>
  );
}
