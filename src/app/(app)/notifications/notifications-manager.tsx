'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Bell, BellOff, CheckCheck, Check } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Tooltip } from '@/components/ui/tooltip';
import { ListToolbar } from '@/components/shared/list-toolbar';
import { Pagination } from '@/components/shared/pagination';
import { EmptyState } from '@/components/shared/empty-state';
import { StatCard } from '@/components/shared/stat-card';
import { buildQuery } from '@/lib/list-params';
import { useI18n } from '@/lib/i18n/provider';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { formatDate, cn } from '@/lib/utils';
import { markNotificationRead, markAllNotificationsRead } from './actions';

export interface NotificationRow {
  id: string; type: string; title_ar: string | null; title_en: string | null;
  body: string | null; link: string | null; entity: string | null;
  record_id: string | null; is_read: boolean; created_at: string;
}

export interface NotificationFilters {
  q: string;
  type: string;
  unreadOnly: boolean;
}

/** Local-day check: is this ISO timestamp on the calendar day "today"? */
function isToday(iso: string): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export function NotificationsManager({
  notifications,
  total,
  unreadTotal,
  page,
  pageSize,
  filters,
  typeOptions,
}: {
  notifications: NotificationRow[];
  total: number;
  unreadTotal: number;
  page: number;
  pageSize: number;
  filters: NotificationFilters;
  typeOptions: string[];
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [navPending, startNav] = useTransition();
  const [busy, setBusy] = useState(false);

  const title = (n: NotificationRow) =>
    (locale === 'ar' ? n.title_ar : n.title_en) || n.title_en || n.title_ar || n.type;

  // Search box keeps local state for responsive typing; URL updates (debounced).
  const [searchInput, setSearchInput] = useState(filters.q);
  useEffect(() => setSearchInput(filters.q), [filters.q]);

  /** Push new list params, resetting to page 1 for any filter change. */
  function pushParams(next: Partial<NotificationFilters & { page: number }>) {
    const merged = { q: filters.q, type: filters.type, unreadOnly: filters.unreadOnly, page, ...next };
    const query = buildQuery({
      q: merged.q || undefined,
      type: merged.type === 'all' ? undefined : merged.type,
      unread: merged.unreadOnly ? '1' : undefined,
      page: merged.page > 1 ? merged.page : undefined,
    });
    startNav(() => router.push(`${pathname}${query}`));
  }

  // Debounce search → URL (~300ms).
  useEffect(() => {
    if (searchInput === filters.q) return;
    const id = window.setTimeout(() => pushParams({ q: searchInput, page: 1 }), 300);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  async function readOne(id: string) {
    setBusy(true);
    try {
      const r = await markNotificationRead(id);
      if (!r.ok) toast.error(r.error ?? t('notifications.toast.error'));
    } finally {
      setBusy(false);
    }
  }

  async function readAll() {
    setBusy(true);
    try {
      const r = await markAllNotificationsRead();
      if (!r.ok) return toast.error(r.error ?? t('notifications.toast.error'));
      toast.success(t('notifications.toast.allRead'));
    } finally {
      setBusy(false);
    }
  }

  // Resolve a row's navigation target: explicit link, else entity/record_id.
  const targetFor = (n: NotificationRow): string | null =>
    n.link || (n.entity && n.record_id ? `/${n.entity}/${n.record_id}` : null);

  // Group the CURRENT page into Today / Earlier (rows are unread-first then newest).
  const groups = useMemo(() => {
    const today: NotificationRow[] = [];
    const earlier: NotificationRow[] = [];
    for (const n of notifications) (isToday(n.created_at) ? today : earlier).push(n);
    return { today, earlier };
  }, [notifications]);

  const filtersActive = !!filters.q || filters.type !== 'all' || filters.unreadOnly;

  function renderRow(n: NotificationRow) {
    const href = targetFor(n);
    const inner = (
      <div
        className={cn(
          'flex items-start justify-between gap-3 rounded-lg border p-4 transition-colors',
          n.is_read ? 'opacity-70 hover:opacity-100' : 'border-primary/40 bg-primary/5',
        )}
      >
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
              n.is_read ? 'bg-secondary text-muted-foreground' : 'bg-primary/10 text-primary',
            )}
          >
            <Bell className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={cn('truncate text-sm', n.is_read ? 'font-medium' : 'font-semibold')}>{title(n)}</span>
              {!n.is_read && (
                <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-primary" aria-label={t('notifications.unread')} />
              )}
            </div>
            {n.body && <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>}
            <p className="mt-1 text-xs text-muted-foreground" dir="ltr">{formatDate(n.created_at, INTL_LOCALE[locale])}</p>
          </div>
        </div>
        {!n.is_read && (
          <Tooltip label={t('notifications.markRead')}>
            <Button
              size="sm"
              variant="ghost"
              className="h-9 w-9 p-0"
              disabled={busy}
              aria-label={t('notifications.markRead')}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); readOne(n.id); }}
            >
              <Check className="h-4 w-4" />
            </Button>
          </Tooltip>
        )}
      </div>
    );
    // Primary row action: tapping marks-read + navigates (when a target exists).
    return href ? (
      <Link key={n.id} href={href} onClick={() => !n.is_read && readOne(n.id)} className="block">{inner}</Link>
    ) : (
      <button
        key={n.id}
        type="button"
        className="block w-full text-start"
        disabled={busy || n.is_read}
        onClick={() => !n.is_read && readOne(n.id)}
      >
        {inner}
      </button>
    );
  }

  function renderGroup(label: string, rows: NotificationRow[]) {
    if (rows.length === 0) return null;
    return (
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</h3>
        {rows.map(renderRow)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label={t('notifications.unread')}
          value={String(unreadTotal)}
          icon={Bell}
          tone={unreadTotal > 0 ? 'warning' : 'success'}
        />
      </div>

      <ListToolbar
        search={searchInput}
        onSearch={setSearchInput}
        placeholder={t('notifications.searchPlaceholder')}
        count={notifications.length}
        total={total}
        filters={
          <>
            <Select
              value={filters.type}
              onChange={(e) => pushParams({ type: e.target.value, page: 1 })}
              className="h-9 w-auto"
            >
              <option value="all">{t('notifications.filterTypeAll')}</option>
              {typeOptions.map((ty) => (
                <option key={ty} value={ty}>{ty}</option>
              ))}
            </Select>
            <Button
              type="button"
              variant={filters.unreadOnly ? 'secondary' : 'outline'}
              size="sm"
              className="h-9"
              aria-pressed={filters.unreadOnly}
              onClick={() => pushParams({ unreadOnly: !filters.unreadOnly, page: 1 })}
            >
              {t('notifications.unreadOnly')}
            </Button>
          </>
        }
        actions={
          <Button size="sm" variant="default" disabled={busy || unreadTotal === 0} onClick={readAll}>
            <CheckCheck className="h-4 w-4" /> {t('notifications.markAllRead')}
          </Button>
        }
      />

      <Card>
        <CardContent className={cn('p-4', navPending && 'opacity-60 transition-opacity')}>
          {notifications.length === 0 ? (
            <EmptyState
              icon={<BellOff />}
              title={filtersActive ? t('notifications.noResults') : t('notifications.empty')}
              description={filtersActive ? t('notifications.noResultsHint') : t('notifications.emptyHint')}
              className="border-0"
            />
          ) : (
            <div className="space-y-6">
              {renderGroup(t('notifications.groupToday'), groups.today)}
              {renderGroup(t('notifications.groupEarlier'), groups.earlier)}
            </div>
          )}
        </CardContent>
      </Card>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        disabled={navPending}
        onPageChange={(p) => pushParams({ page: p })}
      />
    </div>
  );
}
