import { NavLink } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Users,
  Settings,
  Upload,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/admin', label: 'لوحة التحكم', icon: LayoutDashboard },
  { to: '/admin/users', label: 'المستخدمون', icon: Users },
  { to: '/admin/customers-upload', label: 'رفع العملاء', icon: Upload },
  { to: '/admin/settings', label: 'الإعدادات', icon: Settings },
  { to: '/admin/audit', label: 'سجل النشاط', icon: ShieldCheck },
];

export function Sidebar() {
  return (
    <aside className="hidden h-[calc(100vh-4rem)] w-60 shrink-0 border-e border-border bg-card lg:block">
      <nav className="flex h-full flex-col gap-1 p-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/admin'}
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

export function getNavItems() {
  return NAV_ITEMS;
}
