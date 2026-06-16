import { NavLink } from 'react-router-dom';
import { Home, ClipboardList, Map, BarChart3, Menu } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

const items = [
  { to: '/', icon: Home, key: 'home', end: true },
  { to: '/visits', icon: ClipboardList, key: 'visits', end: false },
  { to: '/map', icon: Map, key: 'map', end: false },
  { to: '/dashboards', icon: BarChart3, key: 'dashboards', end: false },
  { to: '/more', icon: Menu, key: 'more', end: false },
] as const;

export function BottomNav() {
  const { t } = useTranslation();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur safe-bottom">
      <ul className="mx-auto flex max-w-screen-sm items-stretch justify-between px-2">
        {items.map(({ to, icon: Icon, key, end }) => (
          <li key={key} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium fi-tap',
                  isActive ? 'text-primary' : 'text-muted-foreground',
                )
              }
            >
              <Icon className="size-5" />
              <span>{t(`nav.${key}`)}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
