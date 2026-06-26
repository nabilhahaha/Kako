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
  /** WhatsApp support link used by the Help nav item. */
  helpHref: string;
}

/**
 * Dedicated Fast Food POS shell — a focused cashier terminal frame that REPLACES the generic
 * ERP chrome (no platform sidebar / top bar / bottom nav / command palette). Warm food theme:
 * dark espresso sidebar, caramel active item, cream content. Scoped entirely to /pos via the
 * `.food-theme` token wrapper + local espresso colors — nothing here leaks to other modules.
 * Pure presentation: it does not touch checkout, the offline queue, scanning, or invoices.
 */
export function PosShell(props: PosShellProps) {
  const { t, locale, setLocale } = useI18n();
  const pathname = usePathname();
  const online = usePosOnline();
  const pending = usePendingSync(props.companyId);
  const [drawer, setDrawer] = useState(false);
  const ar = locale === 'ar';

  // Close the mobile drawer on navigation.
  useEffect(() => { setDrawer(false); }, [pathname]);

  const isActive = (href: string) => (href === '/pos' ? pathname === '/pos' : pathname.startsWith(href));

  const SideContent = (
    <div className="flex h-full flex-col bg-[#2a1c12] text-[#f5e8db]">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 py-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f97316] text-white shadow-sm">
          <Store className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold leading-tight">{props.companyName}</span>
          <span className="block truncate text-[11px] text-[#f5e8db]/60">{t('foodPosShell.posMode')}</span>
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
        {props.navItems.map((it) => {
          const Icon = ICONS[it.icon];
          const active = isActive(it.href);
          return (
            <Link key={it.key} href={it.href}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition',
                active ? 'bg-[#f97316] text-white shadow-sm' : 'text-[#f5e8db]/80 hover:bg-white/5 hover:text-white',
              )}>
              <Icon className="h-[18px] w-[18px] shrink-0" />
              <span className="truncate">{t(it.labelKey)}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer: help, back-office (manager), logout */}
      <div className="space-y-1 border-t border-white/10 px-2 py-2">
        <a href={props.helpHref} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#f5e8db]/80 transition hover:bg-white/5 hover:text-white">
          <LifeBuoy className="h-[18px] w-[18px] shrink-0" /> <span className="truncate">{t('foodPosNav.help')}</span>
        </a>
        {props.backItem && (
          <Link href={props.backItem.href}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#f5e8db]/80 transition hover:bg-white/5 hover:text-white">
            <LayoutGrid className="h-[18px] w-[18px] shrink-0" /> <span className="truncate">{t(props.backItem.labelKey)}</span>
          </Link>
        )}
        <form action="/auth/signout" method="post">
          <button type="submit"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#f5e8db]/80 transition hover:bg-white/5 hover:text-white">
            <LogOut className="h-[18px] w-[18px] shrink-0" /> <span className="truncate">{t('foodPosNav.logout')}</span>
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="food-theme flex h-screen overflow-hidden bg-[#fdf6ec] text-foreground">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 lg:block">{SideContent}</aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className={cn('absolute inset-y-0 w-64 shadow-xl', ar ? 'end-0' : 'start-0')} onClick={(e) => e.stopPropagation()}>
            {SideContent}
          </div>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Compact POS top bar */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[#e7d6c2] bg-white/70 px-3 backdrop-blur">
          <button onClick={() => setDrawer(true)} className="grid h-9 w-9 place-items-center rounded-lg border border-[#e7d6c2] lg:hidden" aria-label={t('foodPosShell.menu')}>
            <Menu className="h-5 w-5" />
          </button>

          {/* Branch + cashier */}
          <div className="min-w-0">
            <div className="truncate text-sm font-bold leading-tight">{props.branchName || props.companyName}</div>
            <div className="truncate text-[11px] text-muted-foreground">
              {props.cashierName} · {props.roleLabel}
            </div>
          </div>

          <div className="ms-auto flex items-center gap-1.5">
            {/* Shift status */}
            <span className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {t('foodPosShell.shiftOpen')}
            </span>

            {/* Online / offline */}
            <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold',
              online ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-100 text-amber-800')}>
              {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{online ? t('foodPosShell.online') : t('foodPosShell.offline')}</span>
            </span>

            {/* Pending sync */}
            {pending > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800" title={t('foodPosShell.pendingSync')}>
                <RefreshCw className={cn('h-3.5 w-3.5', online && 'animate-spin')} /> {pending}
              </span>
            )}

            {/* Language toggle */}
            <button onClick={() => setLocale(ar ? 'en' : 'ar')}
              className="h-8 rounded-lg border border-[#e7d6c2] px-2.5 text-xs font-bold uppercase">
              {ar ? 'EN' : 'ع'}
            </button>
          </div>
        </header>

        {/* Page content (terminal is full-bleed; setup/reports/orders/shift pad themselves) */}
        <main className="min-h-0 flex-1 overflow-y-auto">{props.children}</main>
      </div>
    </div>
  );
}

/** Read the offline queue's pending count (pending + syncing + failed) without owning a drainer
 *  — the terminal drives sync; the shell only reflects it. Refreshes on storage events, online
 *  transitions, and a light interval so the badge stays current across tabs/pages. */
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
