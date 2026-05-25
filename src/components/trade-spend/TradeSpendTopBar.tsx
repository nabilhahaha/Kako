import { useTranslation } from 'react-i18next';
import { Sun, Moon, User } from 'lucide-react';
import { useTradeSpendStore } from '@/stores/tradeSpendStore';
import { SUPPORTED_LANGUAGES, isRTL } from '@/i18n';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

function useTheme() {
  const toggle = () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('ts-theme', isDark ? 'dark' : 'light');
  };
  const isDark = typeof window !== 'undefined' && document.documentElement.classList.contains('dark');
  return { isDark, toggle };
}

export function TradeSpendTopBar() {
  const { t, i18n } = useTranslation();
  const { isDark, toggle } = useTheme();
  const currentUser = useTradeSpendStore((s) => s.currentUser);
  const users = useTradeSpendStore((s) => s.users);
  const switchRole = useTradeSpendStore((s) => s.switchRole);
  const navigate = useNavigate();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    document.documentElement.dir = isRTL(lng) ? 'rtl' : 'ltr';
    document.documentElement.lang = lng;
  };

  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-maroon">
          <span className="text-sm font-bold text-white">R</span>
        </div>
        <h1 className="hidden text-lg font-semibold text-foreground sm:block font-display">
          {t('common.appName')}
        </h1>
      </div>

      <div className="flex items-center gap-2">
        {/* Demo role switcher */}
        <select
          value={currentUser?.id || ''}
          onChange={(e) => {
            switchRole(e.target.value);
            navigate('/trade-spend');
          }}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.display_name} ({u.roles.join(', ')})
            </option>
          ))}
        </select>

        {/* Language selector */}
        <select
          value={i18n.language}
          onChange={(e) => changeLanguage(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {SUPPORTED_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>

        {/* Theme toggle */}
        <Button variant="ghost" size="sm" onClick={toggle} className="h-8 w-8 p-0">
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        {/* Current user info */}
        <div className="hidden items-center gap-1.5 rounded-md bg-muted px-2 py-1 sm:flex">
          <User className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">{currentUser?.display_name}</span>
        </div>
      </div>
    </header>
  );
}
