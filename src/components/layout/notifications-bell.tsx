'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';

export interface NotificationItem {
  label: string;
  href: string;
  count: number;
}

/** Bell with a badge + dropdown of actionable alerts (overdue invoices, today's
 *  appointments, …). Items are computed server-side and passed in. */
export function NotificationsBell({ items }: { items: NotificationItem[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const total = items.reduce((s, i) => s + i.count, 0);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg hover:bg-secondary"
        aria-label={t('shared.notifications.title')}
      >
        <Bell className="h-5 w-5" />
        {total > 0 && (
          <span className="absolute -start-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute end-0 mt-2 w-72 rounded-lg border bg-popover p-2 shadow-lg">
          <p className="px-2 py-1 text-xs font-medium text-muted-foreground">{t('shared.notifications.title')}</p>
          {items.length === 0 ? (
            <p className="p-3 text-center text-sm text-muted-foreground">{t('shared.notifications.empty')}</p>
          ) : (
            items.map((i) => (
              <Link
                key={i.label}
                href={i.href}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm hover:bg-secondary"
              >
                <span>{i.label}</span>
                <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive tabular-nums">{i.count}</span>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
