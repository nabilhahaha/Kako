import { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CalendarCheck,
  Route as RouteIcon,
  Boxes,
  ReceiptText,
  LogOut,
  Wifi,
  WifiOff,
  Languages,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSalesmanDay } from '@/stores/salesmanDayStore';

const NAV = [
  { to: '/salesman/my-day', key: 'myDay', icon: CalendarCheck },
  { to: '/salesman/route', key: 'todayRoute', icon: RouteIcon },
  { to: '/salesman/van-stock', key: 'vanStock', icon: Boxes },
  { to: '/salesman/invoices', key: 'invoices', icon: ReceiptText },
  { to: '/salesman/end-day', key: 'endDay', icon: LogOut },
] as const;

export function SalesmanShell() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const status = useSalesmanDay((s) => s.status);
  const online = useSalesmanDay((s) => s.online);
  const toggleOnline = useSalesmanDay((s) => s.toggleOnline);
  const salesmanName = useSalesmanDay((s) => (isAr ? s.salesmanNameAr : s.salesmanName));
  const routeName = useSalesmanDay((s) => (isAr ? s.routeNameAr : s.routeName));

  // Scope direction to the salesman area without disturbing other routes.
  useEffect(() => {
    const prev = document.documentElement.dir;
    document.documentElement.dir = isAr ? 'rtl' : 'ltr';
    return () => {
      document.documentElement.dir = prev;
    };
  }, [isAr]);

  const statusTone =
    status === 'open'
      ? 'bg-success/15 text-success'
      : status === 'ended'
        ? 'bg-muted text-muted-foreground'
        : 'bg-warning/15 text-warning';
  const statusLabel =
    status === 'open' ? t('salesman.dayOpen') : status === 'ended' ? t('salesman.dayEnded') : t('salesman.dayClosed');

  return (
    <div className="min-h-screen bg-background" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Header: salesman + route + day status + sync */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-screen-sm items-center gap-3 px-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight text-foreground">
              {salesmanName}
            </p>
            <p className="truncate text-[11px] leading-tight text-muted-foreground">
              {routeName}
            </p>
          </div>
          <span
            className={cn(
              'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold',
              statusTone,
            )}
          >
            {statusLabel}
          </span>
          <button
            type="button"
            onClick={toggleOnline}
            aria-label={online ? t('salesman.online') : t('salesman.offline')}
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors active:scale-95',
              online ? 'text-success hover:bg-success/10' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => i18n.changeLanguage(isAr ? 'en' : 'ar')}
            aria-label="Toggle language"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted active:scale-95"
          >
            <Languages className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-screen-sm px-4 pb-24 pt-4 animate-in">
        <Outlet />
      </main>

      {/* Bottom nav: salesman-only items */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul className="mx-auto grid w-full max-w-screen-sm grid-cols-5">
          {NAV.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center gap-1 px-1 py-2.5 text-[11px] transition-colors active:scale-95',
                    isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                <item.icon className="h-5 w-5 shrink-0" />
                <span className="w-full truncate text-center leading-none">
                  {t(`salesman.${item.key}`)}
                </span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
