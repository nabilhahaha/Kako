'use client';

import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/provider';

/** Consistent search + filter + count bar for list screens. Generic and
 *  dependency-free: the caller supplies its own filter controls and actions.
 *  Layout stacks on mobile and lays out in a row from `sm:` up. */
export function ListToolbar({
  search,
  onSearch,
  placeholder,
  filters,
  count,
  total,
  actions,
  className,
}: {
  search: string;
  onSearch: (v: string) => void;
  placeholder?: string;
  /** Caller-supplied filter controls (e.g. <Select> elements). */
  filters?: ReactNode;
  /** Number of currently-visible rows. */
  count?: number;
  /** Total number of rows before filtering. */
  total?: number;
  /** Right-aligned actions (e.g. a "New" button). */
  actions?: ReactNode;
  className?: string;
}) {
  const { t } = useI18n();
  const showCount = typeof count === 'number' && typeof total === 'number';

  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center',
        className,
      )}
    >
      <div className="relative w-full sm:max-w-xs">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={placeholder ?? t('platform.toolbar.searchPlaceholder')}
          className="ps-9"
        />
      </div>

      {filters && (
        <div className="flex flex-wrap items-center gap-2">{filters}</div>
      )}

      {showCount && (
        <p className="text-sm text-muted-foreground" dir="ltr">
          {t('platform.toolbar.showing', { count: count!, total: total! })}
        </p>
      )}

      {actions && (
        <div className="flex items-center gap-2 sm:ms-auto">{actions}</div>
      )}
    </div>
  );
}
