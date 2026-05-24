import { NavLink } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  PackageX,
  CheckSquare,
  ShieldCheck,
  TrendingUp,
  Settings,
  FileSpreadsheet,
  ListChecks,
  FormInput,
  Upload,
  Map,
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
    { to: '/admin/customers-upload', label: 'رفع العملاء', icon: Upload },
    { to: '/admin/raw-data', label: 'البيانات الخام', icon: FileSpreadsheet },
    { to: '/admin/forms', label: 'إدارة النماذج', icon: FormInput },
    { to: '/admin/action-plans', label: 'خطط العمل', icon: ListChecks },
    { to: '/admin/settings', label: 'الإعدادات', icon: Settings },
    { to: '/admin/audit', label: 'سجل النشاط', icon: ShieldCheck },
  ],
  presales_rep: [
    { to: '/salesman', label: 'لوحة التحكم', icon: LayoutDashboard },
    { to: '/salesman/near-expiry', label: 'قارب على الانتهاء', icon: PackageX },
  ],
  presales_supervisor: [
    { to: '/supervisor', label: 'لوحة التحكم', icon: LayoutDashboard },
    { to: '/supervisor/customers', label: 'العملاء', icon: Users },
    { to: '/supervisor/visits', label: 'الزيارات', icon: ClipboardList },
    { to: '/supervisor/approvals/visits', label: 'موافقات الزيارات', icon: CheckSquare },
    { to: '/supervisor/approvals/near-expiry', label: 'قارب على الانتهاء', icon: ShieldCheck },
  ],
  cashvan_supervisor: [
    { to: '/supervisor', label: 'لوحة التحكم', icon: LayoutDashboard },
    { to: '/supervisor/customers', label: 'العملاء', icon: Users },
    { to: '/supervisor/visits', label: 'الزيارات', icon: ClipboardList },
    { to: '/supervisor/approvals/visits', label: 'الموافقات', icon: CheckSquare },
  ],
  regional_manager_roshen: [
    { to: '/regional', label: 'الإقليم', icon: LayoutDashboard },
    { to: '/regional/distributor', label: 'الموزّع', icon: TrendingUp },
    { to: '/regional/coverage', label: 'التغطية', icon: Map },
    { to: '/regional/approvals', label: 'الموافقات', icon: CheckSquare },
  ],
  trade_marketing_manager: [],
  top_management_relia: [],
  top_management_roshen: [],
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
