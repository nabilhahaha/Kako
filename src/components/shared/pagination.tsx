'use client';

import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';

/** Mobile-friendly Prev / "Page X of Y" / Next bar for server-paginated lists.
 *  Large touch targets, disabled at bounds, shows the exact total count.
 *  `page` is 1-based. Renders nothing when there is at most one page and the
 *  caller has not opted to always show it. */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  disabled,
}: {
  /** 1-based current page. */
  page: number;
  pageSize: number;
  /** Exact total row count across all pages. */
  total: number;
  onPageChange: (page: number) => void;
  /** Optional pending state (e.g. during a navigation transition). */
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  if (pageCount <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-3">
      <Button
        variant="outline"
        size="default"
        className="min-w-24"
        disabled={disabled || current <= 1}
        onClick={() => onPageChange(current - 1)}
      >
        <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
        {t('platform.pagination.prev')}
      </Button>

      <span className="text-center text-sm text-muted-foreground" dir="ltr">
        <span className="block">{t('platform.pagination.pageOf', { page: current, pages: pageCount })}</span>
        <span className="block text-xs">{t('platform.pagination.total', { total })}</span>
      </span>

      <Button
        variant="outline"
        size="default"
        className="min-w-24"
        disabled={disabled || current >= pageCount}
        onClick={() => onPageChange(current + 1)}
      >
        {t('platform.pagination.next')}
        <ChevronRight className="h-4 w-4 rtl:rotate-180" />
      </Button>
    </div>
  );
}
