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
  { to: '/trade-spend', labelKey: 'nav.dashboard', icon: LayoutDashboard, roles: ['dept_manager', 'distributor_trade_mktg', 'roshen_approver', 'viewer', 'admin'] },
  { to: '/trade-spend/new-request', labelKey: 'nav.newRequest', icon: PlusCircle, roles: ['dept_manager', 'distributor_trade_mktg', 'admin'] },
  { to: '/trade-spend/requests', labelKey: 'nav.myRequests', icon: FileText, roles: ['dept_manager', 'distributor_trade_mktg', 'admin'] },
  { to: '/trade-spend/approvals', labelKey: 'nav.approvals', icon: ClipboardCheck, roles: ['dept_manager', 'distributor_trade_mktg', 'roshen_approver', 'admin'] },
  { to: '/trade-spend/customers', labelKey: 'nav.customerSummary', icon: BarChart3, roles: ['dept_manager', 'distributor_trade_mktg', 'roshen_approver', 'viewer', 'admin'] },
  { to: '/trade-spend/upload', labelKey: 'nav.dataUpload', icon: Upload, roles: ['admin'] },
  { to: '/trade-spend/users', labelKey: 'nav.users', icon: UsersIcon, roles: ['admin'] },
];

export function TradeSpendSidebar() {
  const { t } = useTranslation();
  const currentUser = useTradeSpendStore((s) => s.currentUser);
  const userRoles = currentUser?.roles || [];

  const visibleItems = NAV_ITEMS.filter((item) =>
    item.roles.some((r) => userRoles.includes(r)),
  );

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
      </nav>

      {/* User card */}
      <div className="border-t p-2">
        <div className="rounded-lg bg-muted/40 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
            Demo
          </p>
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
