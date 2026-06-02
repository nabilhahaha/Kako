'use client';

import Link from 'next/link';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';

/**
 * Simple page-based pager. Builds links to `?page=N`, preserving any extra
 * query params passed in `query` (e.g. the search term `q` or a status filter)
 * so navigating pages keeps the active filters.
 */
export function Pager({
  page,
  pageSize,
  total,
  basePath,
  query,
}: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  query?: Record<string, string | undefined>;
}) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const href = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v != null && v !== '') params.set(k, v);
    }
    params.set('page', String(p));
    return `${basePath}?${params.toString()}`;
  };

  return (
    <div className="mt-3 flex items-center justify-between text-sm">
      <span className="text-muted-foreground tabular-nums" dir="ltr">
        {from}–{to} / {total}
      </span>
      <div className="flex items-center gap-2">
        <PagerLink href={href(page - 1)} disabled={page <= 1}>
          <ChevronRight className="h-4 w-4" /> {t('shared.prev')}
        </PagerLink>
        <span className="text-muted-foreground tabular-nums" dir="ltr">{page} / {pages}</span>
        <PagerLink href={href(page + 1)} disabled={page >= pages}>
          {t('shared.next')} <ChevronLeft className="h-4 w-4" />
        </PagerLink>
      </div>
    </div>
  );
}

function PagerLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="inline-flex cursor-not-allowed items-center gap-1 rounded-md border px-3 py-1.5 text-muted-foreground opacity-50">
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 hover:bg-secondary">
      {children}
    </Link>
  );
}
