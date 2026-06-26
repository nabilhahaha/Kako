'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ScanBarcode, ReceiptText, ClipboardList, BarChart3, SlidersHorizontal, LifeBuoy,
  LayoutGrid, LogOut, Menu, X, Wifi, WifiOff, RefreshCw, Store, type LucideIcon,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';
import { usePosOnline } from './devices/use-pos-online';
import { localStorageStore, memoryStore } from './offline/offline-store';
import { statusCounts } from './offline/offline-queue';
import type { PosNavItem, PosNavIcon } from './pos-nav';

const ICONS: Record<PosNavIcon, LucideIcon> = {
  pos: ScanBarcode, orders: ReceiptText, shift: ClipboardList, reports: BarChart3,
  setup: SlidersHorizontal, help: LifeBuoy, backoffice: LayoutGrid,
};

export interface PosShellProps {
  children: React.ReactNode;
  companyId: string;
  navItems: PosNavItem[];
  backItem: PosNavItem | null;
  companyName: string;
  branchName: string;
  cashierName: string;
  roleLabel: string;
  /** WhatsApp support link used by the Help action. */
  helpHref: string;
}

/**
 * Dedicated Fast Food POS shell — a FULL-SCREEN, sidebar-free cashier terminal. There is NO
 * permanent left rail and NONE of the generic ERP chrome; navigation lives in a compact espresso
 * top bar (with a hidden drawer on small screens), so the product grid / cart / payment get the
 * full width. Warm food theme (espresso bar, caramel active tab, cream content), scoped entirely
 * to /pos via `.food-theme` + local colors. Pure presentation — it never touches checkout, the
 * offline queue, scanning, printing or invoices.
 */
export function PosShell(props: PosShellProps) {
  const { t, locale, setLocale } = useI18n();
  const pathname = usePathname();
  const online = usePosOnline();
  const pending = usePendingSync(props.companyId);
  const [drawer, setDrawer] = useState(false);
  const ar = locale === 'ar';

  useEffect(() => { setDrawer(false); }, [pathname]);

  const isActive = (href: string) => (href === '/pos' ? pathname === '/pos' : pathname.startsWith(href));

  const NavLink = ({ it, block }: { it: PosNavItem; block?: boolean }) => {
    const Icon = ICONS[it.icon];
    const active = isActive(it.href);
    return (
      <Link href={it.href}
        className={cn(
          'flex items-center gap-2 rounded-xl text-sm font-semibold transition',
          block ? 'px-3 py-2.5' : 'px-3 py-1.5',
          active ? 'bg-[#f97316] text-white shadow-sm' : 'text-[#f5e8db]/80 hover:bg-white/10 hover:text-white',
        )}>
        <Icon className="h-[18px] w-[18px] shrink-0" />
        <span className={cn('truncate', !block && 'hidden lg:inline')}>{t(it.labelKey)}</span>
      </Link>
    );
  };

  return (
    <div className="food-theme flex h-screen flex-col overflow-hidden bg-[#fdf6ec] text-foreground">
      {/* ── Compact espresso top nav (replaces the ERP sidebar) ── */}
      <header className="flex h-14 shrink-0 items-center gap-2 bg-[#2a1c12] px-2 text-[#f5e8db] sm:px-3">
        <button onClick={() => setDrawer(true)} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-white/10 md:hidden" aria-label={t('foodPosShell.menu')}>
          <Menu className="h-5 w-5" />
        </button>

        {/* Brand */}
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f97316] text-white shadow-sm"><Store className="h-5 w-5" /></span>
          <span className="hidden min-w-0 sm:block">
            <span className="block max-w-[10rem] truncate text-sm font-bold leading-tight">{props.companyName}</span>
            <span className="block text-[10px] text-[#f5e8db]/60">{t('foodPosShell.posMode')}</span>
          </span>
        </div>

        {/* Inline nav tabs (md+) */}
        <nav className="ms-1 hidden items-center gap-1 md:flex">
          {props.navItems.map((it) => <NavLink key={it.key} it={it} />)}
        </nav>

        {/* Right status + actions cluster */}
        <div className="ms-auto flex items-center gap-1.5">
          {/* Branch · cashier (lg+) */}
          <div className="hidden text-end leading-tight lg:block">
            <div className="max-w-[12rem] truncate text-xs font-semibold">{props.branchName || props.companyName}</div>
            <div className="truncate text-[10px] text-[#f5e8db]/60">{props.cashierName} · {props.roleLabel}</div>
          </div>

          {/* Shift status */}
          <span className="hidden items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> {t('foodPosShell.shiftOpen')}
          </span>

          {/* Online / offline */}
          <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold',
            online ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-400/20 text-amber-200')}>
            {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{online ? t('foodPosShell.online') : t('foodPosShell.offline')}</span>
          </span>

          {/* Pending sync */}
          {pending > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-2.5 py-1 text-[11px] font-bold text-amber-200" title={t('foodPosShell.pendingSync')}>
              <RefreshCw className={cn('h-3.5 w-3.5', online && 'animate-spin')} /> {pending}
            </span>
          )}

          {/* Language */}
          <button onClick={() => setLocale(ar ? 'en' : 'ar')} className="h-8 rounded-lg px-2.5 text-xs font-bold uppercase hover:bg-white/10">
            {ar ? 'EN' : 'ع'}
          </button>

          {/* Help */}
          <a href={props.helpHref} target="_blank" rel="noopener noreferrer" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/10" title={t('foodPosNav.help')}>
            <LifeBuoy className="h-[18px] w-[18px]" />
          </a>

          {/* Back office (manager only) */}
          {props.backItem && (
            <Link href={props.backItem.href} className="hidden h-8 w-8 place-items-center rounded-lg hover:bg-white/10 md:grid" title={t(props.backItem.labelKey)}>
              <LayoutGrid className="h-[18px] w-[18px]" />
            </Link>
          )}

          {/* Logout */}
          <form action="/auth/signout" method="post">
            <button type="submit" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/10" title={t('foodPosNav.logout')}>
              <LogOut className="h-[18px] w-[18px]" />
            </button>
          </form>
        </div>
      </header>

      {/* Full-width content */}
      <main className="min-h-0 flex-1 overflow-y-auto">{props.children}</main>

      {/* Mobile drawer (on-demand nav) */}
      {drawer && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className={cn('absolute inset-y-0 flex w-64 flex-col bg-[#2a1c12] text-[#f5e8db] shadow-xl', ar ? 'end-0' : 'start-0')} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-4">
              <span className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#f97316] text-white"><Store className="h-5 w-5" /></span>
                <span className="truncate text-sm font-bold">{props.companyName}</span>
              </span>
              <button onClick={() => setDrawer(false)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/10"><X className="h-5 w-5" /></button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto px-2">
              {props.navItems.map((it) => <NavLink key={it.key} it={it} block />)}
            </nav>
            <div className="space-y-1 border-t border-white/10 px-2 py-2">
              <a href={props.helpHref} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#f5e8db]/80 hover:bg-white/10">
                <LifeBuoy className="h-[18px] w-[18px]" /> {t('foodPosNav.help')}
              </a>
              {props.backItem && (
                <Link href={props.backItem.href} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#f5e8db]/80 hover:bg-white/10">
                  <LayoutGrid className="h-[18px] w-[18px]" /> {t(props.backItem.labelKey)}
                </Link>
              )}
              <form action="/auth/signout" method="post">
                <button type="submit" className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#f5e8db]/80 hover:bg-white/10">
                  <LogOut className="h-[18px] w-[18px]" /> {t('foodPosNav.logout')}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Read the offline queue's pending count (pending + syncing + failed) without owning a drainer
 *  — the terminal drives sync; the shell only reflects it. */
function usePendingSync(companyId: string): number {
  const store = useMemo(
    () => (typeof window !== 'undefined' && companyId ? localStorageStore(companyId) : memoryStore()),
    [companyId],
  );
  const [n, setN] = useState(0);
  useEffect(() => {
    const read = () => {
      const c = statusCounts(store.list());
      setN((c.pending ?? 0) + (c.syncing ?? 0) + (c.failed ?? 0));
    };
    read();
    const id = window.setInterval(read, 4000);
    window.addEventListener('storage', read);
    window.addEventListener('online', read);
    window.addEventListener('offline', read);
    return () => { window.clearInterval(id); window.removeEventListener('storage', read); window.removeEventListener('online', read); window.removeEventListener('offline', read); };
  }, [store]);
  return n;
}
