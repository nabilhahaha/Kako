import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { getNavForRole } from './Sidebar';
import type { UserRole } from '@/lib/types';

interface BottomNavProps {
  role: UserRole | null;
}

export function BottomNav({ role }: BottomNavProps) {
  const items = getNavForRole(role).slice(0, 4);
  if (items.length === 0) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="grid grid-cols-4">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to.split('/').length === 2}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-1 px-2 py-2.5 text-xs transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              <item.icon className="h-5 w-5" />
              <span className="truncate text-[11px]">{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
