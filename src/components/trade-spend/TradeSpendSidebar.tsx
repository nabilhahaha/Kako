import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  PlusCircle,
  FileText,
  Users as UsersIcon,
  Upload,
  BarChart3,
  ClipboardCheck,
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
    to: '/trade-spend/requests',
    labelKey: 'nav.myRequests',
    icon: FileText,
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
    to: '/trade-spend/upload',
    labelKey: 'nav.dataUpload',
    icon: Upload,
    roles: ['admin'],
  },
  {
    to: '/trade-spend/users',
    labelKey: 'nav.users',
    icon: UsersIcon,
    roles: ['admin'],
  },
];

export function TradeSpendSidebar() {
  const { t } = useTranslation();
  const currentUser = useTradeSpendStore((s) => s.currentUser);
  const userRoles = currentUser?.roles || [];

  const visibleItems = NAV_ITEMS.filter((item) =>
    item.roles.some((r) => userRoles.includes(r)),
  );

  return (
    <aside className="hidden w-56 flex-shrink-0 border-e bg-card shadow-sm lg:flex lg:flex-col">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-maroon">
          <span className="text-base font-bold text-white font-display">R</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground font-display">Roshen</p>
          <p className="text-[10px] text-muted-foreground">{t('common.appName')}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/trade-spend'}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`
            }
          >
            <item.icon className="h-4 w-4 flex-shrink-0" />
            <span>{t(item.labelKey)}</span>
          </NavLink>
        ))}
      </nav>

      <div className="border-t p-3">
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {t('auth.selectRole')}
          </p>
          <p className="mt-1 text-xs font-medium text-foreground">
            {currentUser?.display_name}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {userRoles.map((r) => (
              <span
                key={r}
                className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
              >
                {t(`roles.${r}`)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
