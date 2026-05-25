import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogIn, User, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTradeSpendStore } from '@/stores/tradeSpendStore';
import { SUPPORTED_LANGUAGES, isRTL } from '@/i18n';

export function TradeSpendLoginPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const users = useTradeSpendStore((s) => s.users);
  const setCurrentUser = useTradeSpendStore((s) => s.setCurrentUser);
  const [selectedUserId, setSelectedUserId] = useState(users[0]?.id || '');

  const selectedUser = users.find((u) => u.id === selectedUserId);

  const handleLogin = () => {
    if (selectedUser) {
      setCurrentUser(selectedUser);
      navigate('/trade-spend');
    }
  };

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    document.documentElement.dir = isRTL(lng) ? 'rtl' : 'ltr';
    document.documentElement.lang = lng;
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      {/* Language selector */}
      <div className="fixed top-3 end-3 z-10">
        <select
          value={i18n.language}
          onChange={(e) => changeLanguage(e.target.value)}
          className="h-8 rounded-lg border border-input bg-card px-2.5 text-[11px] font-medium shadow-sm"
        >
          {SUPPORTED_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
      </div>

      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-maroon shadow-lg mb-3">
            <span className="text-xl font-bold text-white">R</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            {t('common.appName')}
          </h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground tracking-wide">
            Roshen Trade Spend Management
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border bg-card p-6 shadow-lg">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t('auth.selectRole')}
              </label>
              <div className="relative">
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="flex h-11 w-full appearance-none rounded-xl border border-input bg-background pe-9 ps-3 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.display_name}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>

            {selectedUser && (
              <div className="rounded-xl bg-muted/40 p-3 space-y-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{selectedUser.display_name}</p>
                    <p className="text-[11px] text-muted-foreground">{selectedUser.email}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {selectedUser.roles.map((role) => (
                    <span key={role} className="inline-flex items-center rounded-md bg-primary/8 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      {t(`roles.${role}`)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <Button
              onClick={handleLogin}
              className="h-11 w-full rounded-xl text-sm font-semibold shadow-md bg-maroon hover:opacity-90 transition-opacity"
            >
              <LogIn className="me-2 h-4 w-4" />
              {t('auth.loginAs')} {selectedUser?.display_name}
            </Button>
          </div>
        </div>

        <p className="mt-4 text-center text-[10px] text-muted-foreground">
          Demo Mode
        </p>
      </div>
    </div>
  );
}
