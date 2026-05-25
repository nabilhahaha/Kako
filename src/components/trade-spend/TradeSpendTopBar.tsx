import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Sun, Moon, User, Lock, LogOut, Building2, Shield, LayoutGrid, Bell } from 'lucide-react';
import { useTradeSpendStore } from '@/stores/tradeSpendStore';
import { SUPPORTED_LANGUAGES, isRTL } from '@/i18n';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

function formatTimeAgo(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMonth = Math.floor(diffDay / 30);
  return `${diffMonth}mo ago`;
}

const NOTIF_TYPE_COLORS: Record<string, string> = {
  approval_pending: 'bg-amber-500',
  approved: 'bg-green-500',
  rejected: 'bg-red-500',
  changes_requested: 'bg-orange-500',
  photos_needed: 'bg-violet-500',
  info: 'bg-blue-500',
};

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
  const setCurrentUser = useTradeSpendStore((s) => s.setCurrentUser);
  const distributors = useTradeSpendStore((s) => s.distributors);
  const currentDistributorId = useTradeSpendStore((s) => s.currentDistributorId);
  const viewMode = useTradeSpendStore((s) => s.viewMode);
  const switchDistributor = useTradeSpendStore((s) => s.switchDistributor);
  const setCurrentDistributor = useTradeSpendStore((s) => s.setCurrentDistributor);
  const navigate = useNavigate();

  const notifications = useTradeSpendStore((s) => s.notifications);
  const markNotificationRead = useTradeSpendStore((s) => s.markNotificationRead);
  const markAllNotificationsRead = useTradeSpendStore((s) => s.markAllNotificationsRead);
  const unreadCount = useTradeSpendStore((s) => s.unreadCount)();

  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentDistName = distributors.find((d) => d.id === currentDistributorId)?.name || '';

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    document.documentElement.dir = isRTL(lng) ? 'rtl' : 'ltr';
    document.documentElement.lang = lng;
  };

  const handleLogout = () => {
    setCurrentUser(null);
    navigate('/trade-spend/login');
  };

  // Admin mode: switch distributor context
  const handleAdminDistributorSwitch = (distId: string) => {
    switchDistributor(distId);
    // Re-set the admin user (switchDistributor clears currentUser)
    setCurrentUser({
      id: 'global-admin',
      email: 'admin@demo.com',
      display_name: 'Global Admin',
      roles: ['admin', 'roshen_approver'],
      active: true,
      password: 'Roshen2026',
      created_at: '2026-01-01',
    });
    setCurrentDistributor(distId);
  };

  return (
    <header className="flex h-12 items-center justify-between border-b bg-card px-3 sm:px-4">
      {/* Left: Logo (mobile only) + Context info */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 lg:hidden">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-maroon">
            <span className="text-xs font-bold text-white">R</span>
          </div>
          <span className="text-sm font-semibold">{t('common.appName')}</span>
        </div>

        {/* Distributor mode: show distributor name prominently */}
        {viewMode === 'distributor' && (
          <div className="flex items-center gap-1.5 rounded-md bg-primary/5 px-2.5 py-1">
            <Building2 className="h-3.5 w-3.5 text-primary" />
            <span className="text-[12px] font-bold text-primary">{currentDistName}</span>
          </div>
        )}

        {/* Admin mode: show "Admin Panel" + distributor selector (mobile) */}
        {viewMode === 'admin' && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-md bg-primary/5 px-2.5 py-1">
              <Shield className="h-3.5 w-3.5 text-primary" />
              <span className="text-[12px] font-bold text-primary">Admin Panel</span>
            </div>
            <select
              value={currentDistributorId || ''}
              onChange={(e) => handleAdminDistributorSwitch(e.target.value)}
              className="h-7 rounded-md border border-primary/30 bg-primary/5 px-2 text-[11px] font-bold text-primary focus:outline-none focus:ring-1 focus:ring-ring lg:hidden"
            >
              {distributors.filter(d => d.active).map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Unified dashboard mode */}
        {viewMode === 'unified_dashboard' && (
          <div className="flex items-center gap-1.5 rounded-md bg-primary/5 px-2.5 py-1">
            <LayoutGrid className="h-3.5 w-3.5 text-primary" />
            <span className="text-[12px] font-bold text-primary">All Distributors</span>
          </div>
        )}
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-1.5 ms-auto">
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

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <Button variant="ghost" size="sm" onClick={() => setShowNotifications(!showNotifications)} className="h-7 w-7 p-0">
            <Bell className="h-3.5 w-3.5" />
          </Button>
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -end-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-white pointer-events-none">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
          {showNotifications && (
            <div className="absolute end-0 top-full mt-1 w-80 max-w-[calc(100vw-1rem)] rounded-xl border bg-card shadow-lg z-50 max-h-96 overflow-y-auto">
              <div className="flex items-center justify-between p-3 border-b">
                <h3 className="text-sm font-semibold">Notifications</h3>
                {unreadCount > 0 && (
                  <button onClick={() => markAllNotificationsRead()} className="text-[10px] text-primary hover:underline">
                    Mark all read
                  </button>
                )}
              </div>
              {notifications.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">No notifications</p>
              ) : (
                notifications.slice(0, 20).map((n) => (
                  <div
                    key={n.id}
                    className={`p-3 border-b last:border-0 cursor-pointer hover:bg-muted/50 transition-colors ${!n.read ? 'bg-primary/5' : ''}`}
                    onClick={() => markNotificationRead(n.id)}
                  >
                    <div className="flex items-start gap-2">
                      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${NOTIF_TYPE_COLORS[n.type] || 'bg-gray-400'}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium">{n.title}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{n.message}</p>
                        <p className="text-[9px] text-muted-foreground/60 mt-1">{formatTimeAgo(n.timestamp)}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Theme */}
        <Button variant="ghost" size="sm" onClick={toggle} className="h-7 w-7 p-0">
          {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </Button>

        {/* Change password (only in distributor mode) */}
        {viewMode === 'distributor' && (
          <Button variant="ghost" size="sm" onClick={() => navigate('/trade-spend/change-password')} className="h-7 w-7 p-0" title="Change Password">
            <Lock className="h-3.5 w-3.5" />
          </Button>
        )}

        {/* User info */}
        <div className="flex h-7 items-center gap-1.5 rounded-md bg-primary/5 px-2">
          <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center">
            <User className="h-3 w-3 text-primary" />
          </div>
          <span className="text-[11px] font-medium max-w-[80px] truncate">{currentUser?.display_name}</span>
        </div>

        {/* Logout */}
        <Button variant="ghost" size="sm" onClick={handleLogout} className="h-7 w-7 p-0 text-destructive hover:text-destructive" title={t('nav.logout')}>
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>
    </header>
  );
}
