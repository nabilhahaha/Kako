import { NavLink } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  PackageX,
  Map,
  CheckSquare,
  ShieldCheck,
  Megaphone,
  TrendingUp,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/lib/types';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const NAV_BY_ROLE: Record<UserRole, NavItem[]> = {
  admin_relia: [
    { to: '/admin', label: 'لوحة التحكم', icon: LayoutDashboard },
    { to: '/admin/users', label: 'المستخدمون', icon: Users },
    { to: '/admin/raw-data', label: 'البيانات الخام', icon: ClipboardList },
    { to: '/admin/settings', label: 'الإعدادات', icon: Settings },
    { to: '/admin/audit', label: 'سجل النشاط', icon: ShieldCheck },
  ],
  presales_rep: [
    { to: '/salesman', label: 'لوحة التحكم', icon: LayoutDashboard },
    { to: '/salesman/customers', label: 'العملاء', icon: Users },
    { to: '/salesman/visits', label: 'الزيارات', icon: ClipboardList },
    { to: '/salesman/near-expiry', label: 'قارب على الانتهاء', icon: PackageX },
  ],
  presales_supervisor: [
    { to: '/supervisor', label: 'فريقي', icon: LayoutDashboard },
    { to: '/supervisor/map', label: 'الخريطة', icon: Map },
    { to: '/supervisor/approvals/visits', label: 'موافقات الزيارات', icon: CheckSquare },
    {
      to: '/supervisor/approvals/near-expiry',
      label: 'قارب على الانتهاء',
      icon: ShieldCheck,
    },
  ],
  cashvan_supervisor: [
    { to: '/supervisor', label: 'فريقي', icon: LayoutDashboard },
    { to: '/supervisor/map', label: 'الخريطة', icon: Map },
    { to: '/supervisor/approvals/visits', label: 'الموافقات', icon: CheckSquare },
  ],
  regional_manager_roshen: [
    { to: '/regional', label: 'الإقليم', icon: LayoutDashboard },
    { to: '/regional/distributor', label: 'الموزّع', icon: TrendingUp },
    { to: '/regional/coverage', label: 'التغطية', icon: Map },
    { to: '/regional/approvals', label: 'الموافقات', icon: CheckSquare },
  ],
  trade_marketing_manager: [
    { to: '/trade-marketing', label: 'لوحة التحكم', icon: LayoutDashboard },
    { to: '/trade-marketing/promotions', label: 'العروض', icon: Megaphone },
    { to: '/trade-marketing/listings', label: 'القنوات', icon: TrendingUp },
    { to: '/trade-marketing/near-expiry', label: 'الفقد', icon: ShieldCheck },
  ],
  top_management_relia: [
    { to: '/executive', label: 'لوحة التنفيذيين', icon: LayoutDashboard },
    { to: '/executive/kpis', label: 'المؤشرات', icon: TrendingUp },
  ],
  top_management_roshen: [
    { to: '/executive', label: 'لوحة التنفيذيين', icon: LayoutDashboard },
    { to: '/executive/kpis', label: 'المؤشرات', icon: TrendingUp },
  ],
};

interface SidebarProps {
  role: UserRole | null;
}

export function Sidebar({ role }: SidebarProps) {
  const items = role ? NAV_BY_ROLE[role] ?? [] : [];

  return (
    <aside className="hidden h-[calc(100vh-4rem)] w-60 shrink-0 border-e border-border bg-card lg:block">
      <nav className="flex h-full flex-col gap-1 p-3">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to.split('/').length === 2}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

export function getNavForRole(role: UserRole | null) {
  return role ? NAV_BY_ROLE[role] ?? [] : [];
}
