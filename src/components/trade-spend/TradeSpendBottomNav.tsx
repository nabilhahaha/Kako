import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  PlusCircle,
  ClipboardCheck,
  BarChart3,
  Settings,
} from 'lucide-react';
import { useTradeSpendStore } from '@/stores/tradeSpendStore';
import type { TradeSpendRole } from '@/lib/trade-spend/types';

interface MobileNavItem {
  to: string;
  labelKey: string;
  icon: React.ElementType;
  roles: TradeSpendRole[];
}

const MOBILE_NAV: MobileNavItem[] = [
  {
    to: '/trade-spend',
    labelKey: 'nav.dashboard',
    icon: LayoutDashboard,
    roles: ['dept_manager', 'distributor_trade_mktg', 'roshen_approver', 'viewer', 'admin'],
  },
  {
    to: '/trade-spend/new-request',
    labelKey: 'nav.newRequest',
    icon: PlusCircle,
    roles: ['dept_manager', 'distributor_trade_mktg', 'admin'],
  },
  {
    to: '/trade-spend/approvals',
    labelKey: 'nav.approvals',
    icon: ClipboardCheck,
    roles: ['dept_manager', 'distributor_trade_mktg', 'roshen_approver', 'admin'],
  },
  {
    to: '/trade-spend/customers',
    labelKey: 'nav.customerSummary',
    icon: BarChart3,
    roles: ['dept_manager', 'distributor_trade_mktg', 'roshen_approver', 'viewer', 'admin'],
  },
  {
    to: '/trade-spend/settings',
    labelKey: 'Settings',
    icon: Settings,
    roles: ['admin'],
  },
];

export function TradeSpendBottomNav() {
  const { t } = useTranslation();
  const currentUser = useTradeSpendStore((s) => s.currentUser);
  const userRoles = currentUser?.roles || [];

  const visibleItems = MOBILE_NAV.filter((item) =>
    item.roles.some((r) => userRoles.includes(r)),
  );

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
    </nav>
  );
}
