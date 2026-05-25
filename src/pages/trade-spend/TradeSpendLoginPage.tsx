import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogIn, Eye, EyeOff, AlertCircle, Shield, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTradeSpendStore } from '@/stores/tradeSpendStore';
import { SUPPORTED_LANGUAGES, isRTL } from '@/i18n';

const ADMIN_EMAIL = 'admin@demo.com';
const ADMIN_PASSWORD = 'Roshen2026';

export function TradeSpendLoginPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const distributors = useTradeSpendStore((s) => s.distributors);
  const setCurrentUser = useTradeSpendStore((s) => s.setCurrentUser);
  const switchDistributor = useTradeSpendStore((s) => s.switchDistributor);
  const setViewMode = useTradeSpendStore((s) => s.setViewMode);
  const setCurrentDistributor = useTradeSpendStore((s) => s.setCurrentDistributor);

  // 'admin' | 'dashboard' | distributor id | ''
  const [selectedOption, setSelectedOption] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const isDistributor = selectedOption !== '' && selectedOption !== 'admin' && selectedOption !== 'dashboard';
  const isAdmin = selectedOption === 'admin';
  const isDashboard = selectedOption === 'dashboard';
  const isManagement = isAdmin || isDashboard;

  // When a distributor is selected, load that distributor's users for quick-select
  const distributorUsers = useMemo(() => {
    if (!isDistributor) return [];
    // We need to read the users from the store after switching — but we haven't
    // switched yet at this point. Instead, read directly from localStorage.
    try {
      const stored = localStorage.getItem(`ts_${selectedOption}_users`);
      if (stored) {
        const users = JSON.parse(stored);
        // Filter out admin-only users — inside a distributor, no admin users appear
        return (users as any[]).filter((u: any) => u.active && !u.roles?.every((r: string) => r === 'admin'));
      }
    } catch { /* ignore */ }
    // Fall back to demo users (excluding pure admins)
    const { DEMO_USERS } = require('@/lib/trade-spend/demo-data');
    return (DEMO_USERS as any[]).filter((u: any) => u.active && !u.roles?.every((r: string) => r === 'admin'));
  }, [isDistributor, selectedOption]);

  const handleLogin = () => {
    setError('');

    if (!selectedOption) {
      setError('Please select an option');
      return;
    }

    // Management login (admin / dashboard)
    if (isManagement) {
      if (email.trim().toLowerCase() !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
        setError('Invalid admin credentials');
        return;
      }
      // Set up admin mode — use the first distributor as context
      const firstDist = distributors.find((d) => d.active);
      if (firstDist) {
        switchDistributor(firstDist.id);
      }
      // Create a synthetic admin user for the session
      setCurrentUser({
        id: 'global-admin',
        email: ADMIN_EMAIL,
        display_name: 'Global Admin',
        roles: ['admin', 'roshen_approver'],
        active: true,
        password: ADMIN_PASSWORD,
        created_at: '2026-01-01',
      });
      setViewMode(isAdmin ? 'admin' : 'unified_dashboard');
      navigate('/trade-spend');
      return;
    }

    // Distributor login
    // Read users for the selected distributor
    let users: any[] = [];
    try {
      const stored = localStorage.getItem(`ts_${selectedOption}_users`);
      if (stored) users = JSON.parse(stored);
    } catch { /* ignore */ }
    if (users.length === 0) {
      // Fall back to demo data
      const { DEMO_USERS } = require('@/lib/trade-spend/demo-data');
      users = [...DEMO_USERS];
    }

    const user = users.find(
      (u: any) => u.email.toLowerCase() === email.trim().toLowerCase(),
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

    // Switch to the selected distributor (saves current data, loads new)
    switchDistributor(selectedOption);
    setCurrentUser(user);
    setViewMode('distributor');
    setCurrentDistributor(selectedOption);
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

          {/* Step 1: Choose option */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Select / اختار
            </label>
            <div className="relative">
              <select
                value={selectedOption}
                onChange={(e) => {
                  setSelectedOption(e.target.value);
                  setEmail('');
                  setPassword('');
                  setError('');
                }}
                className="flex h-12 w-full appearance-none rounded-xl border-2 border-primary/30 bg-primary/5 px-3 text-sm font-semibold shadow-sm focus:border-primary focus:outline-none"
              >
                <option value="">Choose...</option>
                <optgroup label="Distributors / الموزعين">
                  {distributors.filter(d => d.active).map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </optgroup>
                <optgroup label="Management / الإدارة">
                  <option value="admin">Admin Panel</option>
                  <option value="dashboard">All Distributors Dashboard</option>
                </optgroup>
              </select>
            </div>
          </div>

          {/* Show a hint for management modes */}
          {isManagement && (
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground">
              {isAdmin ? (
                <Shield className="h-4 w-4 flex-shrink-0 text-primary" />
              ) : (
                <LayoutGrid className="h-4 w-4 flex-shrink-0 text-primary" />
              )}
              <span>
                {isAdmin
                  ? 'Admin Panel — manage users, data, and settings across distributors'
                  : 'Unified Dashboard — aggregate view across all distributors'}
              </span>
            </div>
          )}

          {selectedOption && (
            <>
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

              {/* Quick select user — only for distributor mode */}
              {isDistributor && distributorUsers.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Quick Select
                  </label>
                  <select
                    value=""
                    onChange={(e) => {
                      const u = distributorUsers.find((u: any) => u.id === e.target.value);
                      if (u) { setEmail(u.email); setPassword(u.password); }
                    }}
                    className="flex h-10 w-full rounded-xl border border-input bg-muted/30 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                  >
                    <option value="">Select user to fill...</option>
                    {distributorUsers.map((u: any) => (
                      <option key={u.id} value={u.id}>
                        {u.display_name} — {u.email}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Quick fill for admin modes */}
              {isManagement && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Quick Select
                  </label>
                  <button
                    type="button"
                    onClick={() => { setEmail(ADMIN_EMAIL); setPassword(ADMIN_PASSWORD); }}
                    className="flex h-10 w-full items-center rounded-xl border border-input bg-muted/30 px-3 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
                  >
                    Fill admin credentials
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
