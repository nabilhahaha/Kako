import { useLang } from '../App.jsx';
import LanguageToggle from './LanguageToggle.jsx';

export default function Header({ title, subtitle, onLogout, onBack }) {
  const { tr } = useLang();
  return (
    <header
      className="sticky top-0 z-30 bg-gradient-to-l from-roshen-600 to-roshen-800 text-white shadow-md"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex items-center gap-2 px-4 py-3">
        {onBack && (
          <button
            onClick={onBack}
            aria-label="back"
            className="bg-white/10 hover:bg-white/20 rounded-full w-9 h-9 flex items-center justify-center transition"
          >
            <span className="rtl-only">→</span>
            <span className="ltr-only">←</span>
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold leading-tight truncate">{title || tr.appName}</h1>
          {subtitle && <p className="text-xs opacity-80 truncate">{subtitle}</p>}
        </div>
        <LanguageToggle />
        {onLogout && (
          <button
            onClick={onLogout}
            title={tr.logout}
            aria-label={tr.logout}
            className="bg-white/10 hover:bg-white/20 rounded-full w-9 h-9 flex items-center justify-center transition"
          >
            ⏻
          </button>
        )}
      </div>
    </header>
  );
}
