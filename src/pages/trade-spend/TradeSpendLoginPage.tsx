import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogIn, User, ChevronDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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
      {/* Language selector - top right */}
      <div className="fixed top-4 end-4 z-10">
        <select
          value={i18n.language}
          onChange={(e) => changeLanguage(e.target.value)}
          className="h-9 rounded-lg border border-input bg-card px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {SUPPORTED_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
      </div>

      <Card className="w-full max-w-md shadow-xl border-0 bg-card">
        <CardContent className="p-8">
          {/* Logo & Branding */}
          <div className="flex flex-col items-center mb-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-maroon shadow-lg mb-4">
              <span className="text-2xl font-bold text-white font-display">R</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground font-display">
              {t('common.appName')}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Roshen Trade Spend Management
            </p>
          </div>

          {/* User Selection */}
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {t('auth.selectRole')}
              </label>
              <div className="relative">
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="flex h-12 w-full appearance-none rounded-xl border border-input bg-background pe-10 ps-4 text-sm font-medium shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.display_name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>

            {/* Selected user info */}
            {selectedUser && (
              <div className="rounded-xl bg-muted/50 p-4 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {selectedUser.display_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedUser.email}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {selectedUser.roles.map((role) => (
                    <span
                      key={role}
                      className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary"
                    >
                      {t(`roles.${role}`)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Login button */}
            <Button
              onClick={handleLogin}
              className="h-12 w-full rounded-xl bg-maroon text-base font-semibold text-white shadow-lg hover:opacity-90 transition-opacity"
            >
              <LogIn className="me-2 h-5 w-5" />
              {t('auth.loginAs')} {selectedUser?.display_name}
            </Button>
          </div>

          {/* Footer */}
          <p className="mt-6 text-center text-[11px] text-muted-foreground">
            Demo Mode — {t('auth.switchRole')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
