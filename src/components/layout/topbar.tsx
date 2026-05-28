'use client';

import { useState, useRef, useEffect } from 'react';
import { BRANCH_ROLES } from '@/lib/erp/constants';
import { initialsFromName } from '@/lib/utils';
import type { BranchRole } from '@/lib/erp/types';
import { LogOut, ChevronDown, ShieldCheck } from 'lucide-react';

interface TopBarProps {
  fullName: string | null;
  email: string | null;
  isSuperAdmin: boolean;
  memberships: { branchName: string; role: BranchRole }[];
}

export function TopBar({
  fullName,
  email,
  isSuperAdmin,
  memberships,
}: TopBarProps) {
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

  const displayName = fullName || email || 'مستخدم';

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-card/80 px-4 backdrop-blur lg:px-6">
      <div className="min-w-0">
        {memberships.length > 0 ? (
          <p className="truncate text-sm font-medium">
            {memberships[0].branchName}
            <span className="mx-1 text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              {BRANCH_ROLES[memberships[0].role]?.ar}
            </span>
          </p>
        ) : isSuperAdmin ? (
          <p className="flex items-center gap-1 text-sm font-medium text-primary">
            <ShieldCheck className="h-4 w-4" /> مدير النظام
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">لا توجد فروع مسندة</p>
        )}
      </div>

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
          <div className="absolute left-0 mt-2 w-56 rounded-lg border bg-card p-2 shadow-lg">
            <div className="border-b px-2 pb-2">
              <p className="truncate text-sm font-medium">{displayName}</p>
              <p dir="ltr" className="truncate text-right text-xs text-muted-foreground">
                {email}
              </p>
            </div>
            <form action="/auth/signout" method="post" className="pt-2">
              <button
                type="submit"
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-destructive hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" />
                تسجيل الخروج
              </button>
            </form>
          </div>
        )}
      </div>
    </header>
  );
}
