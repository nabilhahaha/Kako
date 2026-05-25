import { useTranslation } from 'react-i18next';
import { Sun, Moon, User, Lock } from 'lucide-react';
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
    <header className="flex h-12 items-center justify-between border-b bg-card px-3 sm:px-4">
      {/* Left: Logo */}
      <div className="flex items-center gap-2 lg:hidden">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-maroon">
          <span className="text-xs font-bold text-white">R</span>
        </div>
        <span className="text-sm font-semibold">{t('common.appName')}</span>
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-1.5 ms-auto">
        {/* Role switcher */}
        <select
          value={currentUser?.id || ''}
          onChange={(e) => { switchRole(e.target.value); navigate('/trade-spend'); }}
          className="h-7 max-w-[140px] rounded-md border border-input bg-background px-1.5 text-[11px] font-medium focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.display_name}</option>
          ))}
        </select>

        {/* Language */}
        <select
          value={i18n.language}
          onChange={(e) => changeLanguage(e.target.value)}
          className="h-7 rounded-md border border-input bg-background px-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {SUPPORTED_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>

        {/* Theme */}
        <Button variant="ghost" size="sm" onClick={toggle} className="h-7 w-7 p-0">
          {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </Button>

        {/* Change password */}
        <Button variant="ghost" size="sm" onClick={() => navigate('/trade-spend/change-password')} className="h-7 w-7 p-0" title="Change Password">
          <Lock className="h-3.5 w-3.5" />
        </Button>

        {/* User avatar */}
        <div className="hidden sm:flex h-7 items-center gap-1.5 rounded-md bg-primary/5 px-2">
          <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center">
            <User className="h-3 w-3 text-primary" />
          </div>
          <span className="text-[11px] font-medium max-w-[100px] truncate">{currentUser?.display_name}</span>
        </div>
      </div>
    </header>
  );
}
