import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  PlusCircle,
  FileText,
  Users as UsersIcon,
  Upload,
  BarChart3,
  ClipboardCheck,
  Megaphone,
  Database,
  Settings,
  LogOut,
  Building2,
} from 'lucide-react';
import { useTradeSpendStore } from '@/stores/tradeSpendStore';
import type { TradeSpendRole } from '@/lib/trade-spend/types';

interface NavItem {
  to: string;
  labelKey: string;
  icon: React.ElementType;
  roles: TradeSpendRole[];
}

const NAV_ITEMS: NavItem[] = [
  { to: '/trade-spend', labelKey: 'nav.dashboard', icon: LayoutDashboard, roles: ['dept_manager', 'distributor_trade_mktg', 'roshen_approver', 'viewer'] },
  { to: '/trade-spend/new-request', labelKey: 'nav.newRequest', icon: PlusCircle, roles: ['dept_manager', 'distributor_trade_mktg'] },
  { to: '/trade-spend/requests', labelKey: 'nav.myRequests', icon: FileText, roles: ['dept_manager', 'distributor_trade_mktg'] },
  { to: '/trade-spend/approvals', labelKey: 'nav.approvals', icon: ClipboardCheck, roles: ['dept_manager', 'distributor_trade_mktg', 'roshen_approver'] },
  { to: '/trade-spend/customers', labelKey: 'nav.customerSummary', icon: BarChart3, roles: ['dept_manager', 'distributor_trade_mktg', 'roshen_approver', 'viewer'] },
  { to: '/trade-spend/promotions', labelKey: 'nav.promotions', icon: Megaphone, roles: ['dept_manager', 'distributor_trade_mktg', 'roshen_approver', 'viewer'] },
];

// Admin-mode nav: Settings only (Users, Upload, Settings per distributor)
const ADMIN_NAV_ITEMS: NavItem[] = [
  { to: '/trade-spend/users', labelKey: 'nav.users', icon: UsersIcon, roles: ['admin'] },
  { to: '/trade-spend/upload', labelKey: 'nav.dataUpload', icon: Upload, roles: ['admin'] },
  { to: '/trade-spend/commercial-data', labelKey: 'nav.commercialData', icon: Database, roles: ['admin'] },
  { to: '/trade-spend/settings', labelKey: 'Settings', icon: Settings, roles: ['admin'] },
];

// Unified dashboard nav: minimal
const DASHBOARD_NAV_ITEMS: NavItem[] = [
  { to: '/trade-spend', labelKey: 'nav.dashboard', icon: LayoutDashboard, roles: ['admin', 'roshen_approver'] },
  { to: '/trade-spend/promotions', labelKey: 'nav.promotions', icon: Megaphone, roles: ['admin', 'roshen_approver'] },
];

export function TradeSpendSidebar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const currentUser = useTradeSpendStore((s) => s.currentUser);
  const viewMode = useTradeSpendStore((s) => s.viewMode);
  const distributors = useTradeSpendStore((s) => s.distributors);
  const currentDistributorId = useTradeSpendStore((s) => s.currentDistributorId);
  const switchDistributor = useTradeSpendStore((s) => s.switchDistributor);
  const setCurrentUser = useTradeSpendStore((s) => s.setCurrentUser);
  const setCurrentDistributor = useTradeSpendStore((s) => s.setCurrentDistributor);
  const userRoles = currentUser?.roles || [];

  // Determine which nav items to show
  let navItems: NavItem[];
  if (viewMode === 'unified_dashboard') {
    navItems = DASHBOARD_NAV_ITEMS;
  } else if (viewMode === 'admin') {
    navItems = ADMIN_NAV_ITEMS;
  } else {
    navItems = NAV_ITEMS;
  }

  const visibleItems = navItems.filter((item) =>
    item.roles.some((r) => userRoles.includes(r)),
  );

  const handleBackToLogin = () => {
    setCurrentUser(null);
    navigate('/trade-spend/login');
  };

  // Admin mode: switch distributor context
  const handleAdminDistributorSwitch = (distId: string) => {
    // Save current state, load new distributor's data
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

  const currentDistName = distributors.find((d) => d.id === currentDistributorId)?.name || '';

  return (
    <aside className="hidden w-[220px] flex-shrink-0 border-e bg-card lg:flex lg:flex-col">
      {/* Brand */}
      <div className="flex h-12 items-center gap-2.5 border-b px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-maroon shadow-sm">
          <span className="text-sm font-bold text-white">R</span>
        </div>
        <div className="leading-none">
          <p className="text-[13px] font-bold text-foreground tracking-tight">Roshen</p>
          <p className="text-[9px] text-muted-foreground tracking-wide uppercase">Trade Spend</p>
        </div>
      </div>

      {/* Admin mode: Distributor selector */}
      {viewMode === 'admin' && (
        <div className="border-b px-3 py-2.5">
          <label className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/70 block mb-1">
            Distributor Context
          </label>
          <select
            value={currentDistributorId || ''}
            onChange={(e) => handleAdminDistributorSwitch(e.target.value)}
            className="flex h-8 w-full rounded-lg border border-primary/30 bg-primary/5 px-2 text-[11px] font-bold text-primary focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {distributors.filter(d => d.active).map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Mode indicator */}
      {viewMode !== 'distributor' && (
        <div className="px-3 py-2 border-b">
          <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-2.5 py-1.5">
            <Building2 className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] font-semibold text-primary">
              {viewMode === 'admin' ? 'Admin Panel' : 'All Distributors'}
            </span>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 py-2 px-2 space-y-0.5">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/trade-spend'}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all ${
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`
            }
          >
            <item.icon className="h-[18px] w-[18px] flex-shrink-0" strokeWidth={1.8} />
            <span>{t(item.labelKey)}</span>
          </NavLink>
        ))}

        {/* Back to login */}
        <button
          onClick={handleBackToLogin}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-all mt-2"
        >
          <LogOut className="h-[18px] w-[18px] flex-shrink-0" strokeWidth={1.8} />
          <span>Back to Login</span>
        </button>
      </nav>

      {/* User card */}
      <div className="border-t p-2">
        <div className="rounded-lg bg-muted/40 px-3 py-2.5">
          {viewMode === 'distributor' && (
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              {currentDistName}
            </p>
          )}
          {viewMode !== 'distributor' && (
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              {viewMode === 'admin' ? 'Admin' : 'Dashboard'}
            </p>
          )}
          <p className="mt-0.5 text-[12px] font-semibold text-foreground truncate">
            {currentUser?.display_name}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {userRoles.map((r) => (
              <span key={r} className="inline-block rounded bg-primary/8 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                {t(`roles.${r}`)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
