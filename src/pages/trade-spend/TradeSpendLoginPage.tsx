import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogIn, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTradeSpendStore } from '@/stores/tradeSpendStore';
import { SUPPORTED_LANGUAGES, isRTL } from '@/i18n';

export function TradeSpendLoginPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const users = useTradeSpendStore((s) => s.users);
  const setCurrentUser = useTradeSpendStore((s) => s.setCurrentUser);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = () => {
    setError('');
    const user = users.find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase(),
    );
    if (!user) {
      setError('User not found');
      return;
    }
    if (!user.active) {
      setError('Account is inactive');
      return;
    }
    if (user.password !== password) {
      setError('Wrong password');
      return;
    }
    setCurrentUser(user);
    navigate('/trade-spend');
  };

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    document.documentElement.dir = isRTL(lng) ? 'rtl' : 'ltr';
    document.documentElement.lang = lng;
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      {/* Language */}
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

        {/* Login Card */}
        <div className="rounded-2xl border bg-card p-6 shadow-lg space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-2.5 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t('auth.email')}
            </label>
            <Input
              type="email"
              placeholder="email@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 rounded-xl"
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t('auth.password')}
            </label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 rounded-xl pe-10"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button
            onClick={handleLogin}
            className="h-11 w-full rounded-xl text-sm font-semibold shadow-md bg-maroon hover:opacity-90 transition-opacity"
          >
            <LogIn className="me-2 h-4 w-4" />
            {t('auth.login')}
          </Button>

          {/* Quick select user */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Quick Select
            </label>
            <select
              value=""
              onChange={(e) => {
                const u = users.find((u) => u.id === e.target.value);
                if (u) { setEmail(u.email); setPassword(u.password); }
              }}
              className="flex h-10 w-full rounded-xl border border-input bg-muted/30 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            >
              <option value="">Select user to fill...</option>
              {users.filter(u => u.active).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.display_name} — {u.email}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
