'use client';

import { useState, useRef, useEffect } from 'react';
import { BRANCH_ROLES } from '@/lib/erp/constants';
import { initialsFromName } from '@/lib/utils';
import type { BranchRole } from '@/lib/erp/types';
import { LogOut, ChevronDown, ShieldCheck, Search } from 'lucide-react';
import { NotificationsBell, type NotificationItem } from './notifications-bell';
import { LanguageToggle } from './language-toggle';
import { ThemeToggle } from './theme-toggle';
import { useI18n } from '@/lib/i18n/provider';

interface TopBarProps {
  fullName: string | null;
  email: string | null;
  isSuperAdmin: boolean;
  memberships: { branchName: string; role: BranchRole }[];
  notifications?: NotificationItem[];
}

export function TopBar({
  fullName,
  email,
  isSuperAdmin,
  memberships,
  notifications = [],
}: TopBarProps) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const displayName = fullName || email || t('common.user');

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-card/80 px-4 backdrop-blur lg:px-6">
      <div className="min-w-0">
        {memberships.length > 0 ? (
          <p className="truncate text-sm font-medium">
            {memberships[0].branchName}
            <span className="mx-1 text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              {BRANCH_ROLES[memberships[0].role]?.[locale]}
            </span>
          </p>
        ) : isSuperAdmin ? (
          <p className="flex items-center gap-1 text-sm font-medium text-primary">
            <ShieldCheck className="h-4 w-4" /> {t('shell.sysAdmin')}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">{t('shell.noBranches')}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
      <button
        onClick={() => window.dispatchEvent(new Event('open-command-palette'))}
        className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary"
        aria-label={t('common.search')}
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">{t('common.searchEllipsis')}</span>
        <kbd className="hidden rounded border bg-secondary px-1.5 py-0.5 text-[10px] md:inline" dir="ltr">Ctrl K</kbd>
      </button>

      <LanguageToggle />

      <ThemeToggle />

      <NotificationsBell items={notifications} />

      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-secondary"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initialsFromName(displayName)}
          </span>
          <span className="hidden text-sm font-medium sm:inline">
            {displayName}
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>

        {open && (
          <div className="absolute end-0 mt-2 w-56 rounded-lg border bg-card p-2 shadow-lg">
            <div className="border-b px-2 pb-2">
              <p className="truncate text-sm font-medium">{displayName}</p>
              <p dir="ltr" className="truncate text-end text-xs text-muted-foreground">
                {email}
              </p>
            </div>
            <form action="/auth/signout" method="post" className="pt-2">
              <button
                type="submit"
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-destructive hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" />
                {t('common.signOut')}
              </button>
            </form>
          </div>
        )}
      </div>
      </div>
    </header>
  );
}
