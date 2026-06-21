'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';

/** Focused Platform Owner sub-navigation — a horizontal tab bar across the /platform
 *  workspace. Pure navigation to the EXISTING platform routes (no new pages, no new
 *  logic); the global Sidebar stays as the app-wide navigation. Active tab is derived
 *  from the current path. Horizontally scrollable on narrow widths so nothing is cut off. */
const TABS: { key: string; href: string }[] = [
  { key: 'overview', href: '/platform' },
  { key: 'companies', href: '/platform/companies' },
  { key: 'subscriptions', href: '/platform/plans' },
  { key: 'users', href: '/platform/staff' },
  { key: 'modules', href: '/platform/entitlements' },
  { key: 'roles', href: '/platform/roles' },
  { key: 'billing', href: '/platform/billing' },
  { key: 'audit', href: '/platform/audit' },
  { key: 'analytics', href: '/platform/analytics' },
];

export function PlatformTabs() {
  const { t } = useI18n();
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === '/platform' ? pathname === '/platform' : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="-mx-1 overflow-x-auto border-b" aria-label={t('platform.companies.tabsAria')}>
      <ul className="flex min-w-max items-center gap-1 px-1">
        {TABS.map((tab) => {
          const active = isActive(tab.href);
          return (
            <li key={tab.key}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex items-center whitespace-nowrap rounded-t-md border-b-2 px-3.5 py-2.5 text-sm transition-colors',
                  active
                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                    : 'border-transparent font-medium text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                )}
              >
                {t(`platform.companies.tab_${tab.key}`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
