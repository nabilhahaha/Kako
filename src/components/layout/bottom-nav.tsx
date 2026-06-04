'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { Permission } from '@/lib/erp/permissions';
import { useMobileNav } from '@/lib/stores/mobile-nav';
import { useI18n } from '@/lib/i18n/provider';
import { Menu } from 'lucide-react';
import { BOTTOM_NAV_TABS } from './bottom-nav-tabs';

/** Mobile bottom tab bar (UX-3): always-visible quick access to the most-used
 *  destinations for the role, so field/cashier users reach key screens in one tap
 *  without opening the full menu. "More" opens the same drawer the sidebar renders.
 *  Hidden on desktop (`lg:`), where the sidebar is always visible. */
export function BottomNav({
  permissions,
  isSuperAdmin,
}: {
  permissions: Permission[];
  isSuperAdmin: boolean;
}) {
  const pathname = usePathname();
  const { t } = useI18n();
  const setOpen = useMobileNav((s) => s.setOpen);
  const can = (p?: Permission) => !p || isSuperAdmin || permissions.includes(p);

  const visible = BOTTOM_NAV_TABS.filter((tab) => can(tab.perm))
    .map((tab) => ({ href: tab.href, icon: tab.icon, label: t(tab.labelKey) }))
    .slice(0, 4);
  const cols = visible.length + 1;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 grid border-t bg-card/95 backdrop-blur lg:hidden"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      aria-label={t('common.menu')}
    >
      {visible.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(tab.href + '/');
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium',
              active ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <Icon className="h-5 w-5" />
            <span>{tab.label}</span>
          </Link>
        );
      })}
      <button
        onClick={() => setOpen(true)}
        className="flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground"
      >
        <Menu className="h-5 w-5" />
        <span>{t('nav.bottom.more')}</span>
      </button>
    </nav>
  );
}
