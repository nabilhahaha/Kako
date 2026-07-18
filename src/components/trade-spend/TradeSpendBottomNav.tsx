import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  PlusCircle,
  ClipboardCheck,
  BarChart3,
  Megaphone,
  Settings,
  LogOut,
} from 'lucide-react';
import { useTradeSpendStore } from '@/stores/tradeSpendStore';
import type { TradeSpendRole } from '@/lib/trade-spend/types';

interface MobileNavItem {
  to: string;
  labelKey: string;
  icon: React.ElementType;
  roles: TradeSpendRole[];
}

// Admin mobile nav
const ADMIN_MOBILE_NAV: MobileNavItem[] = [
  { to: '/trade-spend/users', labelKey: 'nav.users', icon: Settings, roles: ['admin'] },
  { to: '/trade-spend/upload', labelKey: 'nav.dataUpload', icon: LayoutDashboard, roles: ['admin'] },
  { to: '/trade-spend/settings', labelKey: 'Settings', icon: Settings, roles: ['admin'] },
];

const MOBILE_NAV: MobileNavItem[] = [
  {
    to: '/trade-spend',
    labelKey: 'nav.dashboard',
    icon: LayoutDashboard,
    roles: ['dept_manager', 'distributor_trade_mktg', 'roshen_approver', 'viewer'],
  },
  {
    to: '/trade-spend/new-request',
    labelKey: 'nav.newRequest',
    icon: PlusCircle,
    roles: ['dept_manager', 'distributor_trade_mktg'],
  },
  {
    to: '/trade-spend/approvals',
    labelKey: 'nav.approvals',
    icon: ClipboardCheck,
    roles: ['dept_manager', 'distributor_trade_mktg', 'roshen_approver'],
  },
  {
    to: '/trade-spend/customers',
    labelKey: 'nav.customerSummary',
    icon: BarChart3,
    roles: ['dept_manager', 'distributor_trade_mktg', 'roshen_approver', 'viewer'],
  },
  {
    to: '/trade-spend/promotions',
    labelKey: 'nav.promotions',
    icon: Megaphone,
    roles: ['dept_manager', 'distributor_trade_mktg', 'roshen_approver', 'viewer'],
  },
];

// Unified dashboard: minimal nav
const DASHBOARD_MOBILE_NAV: MobileNavItem[] = [
  {
    to: '/trade-spend',
    labelKey: 'nav.dashboard',
    icon: LayoutDashboard,
    roles: ['admin', 'roshen_approver'],
  },
];

export function TradeSpendBottomNav() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const currentUser = useTradeSpendStore((s) => s.currentUser);
  const viewMode = useTradeSpendStore((s) => s.viewMode);
  const setCurrentUser = useTradeSpendStore((s) => s.setCurrentUser);
  const userRoles = currentUser?.roles || [];

  const navItems = viewMode === 'unified_dashboard' ? DASHBOARD_MOBILE_NAV : viewMode === 'admin' ? ADMIN_MOBILE_NAV : MOBILE_NAV;

  const visibleItems = navItems.filter((item) =>
    item.roles.some((r) => userRoles.includes(r)),
  );

  const handleBackToLogin = () => {
    setCurrentUser(null);
    navigate('/trade-spend/login');
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 flex h-14 items-center justify-around border-t bg-card/95 backdrop-blur-md shadow-[0_-2px_10px_rgba(0,0,0,0.06)] lg:hidden safe-area-bottom">
      {visibleItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/trade-spend'}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 px-1.5 py-1 text-[9px] font-medium transition-colors ${
              isActive ? 'text-primary' : 'text-muted-foreground'
            }`
          }
        >
          <item.icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
          <span className="truncate max-w-[56px]">{t(item.labelKey)}</span>
        </NavLink>
      ))}
      {/* Back to login button in mobile nav */}
      <button
        onClick={handleBackToLogin}
        className="flex flex-col items-center gap-0.5 px-1.5 py-1 text-[9px] font-medium text-muted-foreground transition-colors"
      >
        <LogOut className="h-[18px] w-[18px]" strokeWidth={1.8} />
        <span className="truncate max-w-[56px]">Logout</span>
      </button>
    </nav>
  );
}
