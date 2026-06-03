'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Activity, ScrollText, Building2, ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Tooltip } from '@/components/ui/tooltip';
import { StatCard } from '@/components/shared/stat-card';
import { ListToolbar } from '@/components/shared/list-toolbar';
import { Pagination } from '@/components/shared/pagination';
import { EmptyState } from '@/components/shared/empty-state';
import { buildQuery } from '@/lib/list-params';
import { useI18n } from '@/lib/i18n/provider';
import {
  AUDIT_ENTITY_LABELS,
  AUDIT_DESTRUCTIVE_ACTIONS,
  describeAuditEvent,
} from '@/lib/erp/audit';

// ─────────────────────────────────────────────────────────────────────────────
// Activity Feed (client, READ-ONLY).
//
// Differentiated from the forensic Audit Log (/platform/audit): this is the
// friendly "what's happening across the platform" stream — a calm, day-grouped
// vertical timeline of human-readable sentences. It deliberately stays lean
// (period scope + entity + company + search) and offers NO table view or
// exhaustive action/actor forensic filtering. For deep drill-down it cross-links
// to the Audit Log rather than duplicating it.
//
// Attention → Information: the top StatCard summary is the Attention layer
// ("N events today · M this week"); the stream below is the Information layer.
// The closest thing to a primary action on this INFORMATION surface is the date
// scope (default = Today) plus the "View full audit log" cross-link.
// ─────────────────────────────────────────────────────────────────────────────

const DESTRUCTIVE = AUDIT_DESTRUCTIVE_ACTIONS;

export interface ActivityRow {
  id: string;
  actor_email: string | null;
  company_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export type ActivityDateScope = 'today' | '7d' | '30d' | 'all';

export interface ActivityFilters {
  q: string;
  entity: string;
  company: string;
  scope: ActivityDateScope;
}

export interface ActivityOptions {
  entities: string[];
  companies: { id: string; name: string }[];
}

/** Stable day key (local) used to group the timeline. */
function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Human day header: Today / Yesterday / a medium date. */
function dayLabel(iso: string, locale: 'en' | 'ar', todayLbl: string, yesterdayLbl: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  if (diffDays === 0) return todayLbl;
  if (diffDays === 1) return yesterdayLbl;
  return d.toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium' });
}

function relativeTime(iso: string, locale: 'en' | 'ar'): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const sec = Math.round((Date.now() - then) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale === 'ar' ? 'ar-EG' : 'en', { numeric: 'auto' });
  const abs = Math.abs(sec);
  if (abs < 60) return rtf.format(-sec, 'second');
  const min = Math.round(sec / 60);
  if (Math.abs(min) < 60) return rtf.format(-min, 'minute');
  const hr = Math.round(min / 60);
  if (Math.abs(hr) < 24) return rtf.format(-hr, 'hour');
  const day = Math.round(hr / 24);
  if (Math.abs(day) < 30) return rtf.format(-day, 'day');
  const month = Math.round(day / 30);
  if (Math.abs(month) < 12) return rtf.format(-month, 'month');
  return rtf.format(-Math.round(month / 12), 'year');
}

/** Absolute timestamp shown on hover. */
function absoluteTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export function ActivityFeed({
  rows,
  companyNames,
  total,
  page,
  pageSize,
  filters,
  options,
  summary,
}: {
  rows: ActivityRow[];
  companyNames: Record<string, string>;
  total: number;
  page: number;
  pageSize: number;
  filters: ActivityFilters;
  options: ActivityOptions;
  summary: { today: number; week: number };
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [navPending, startNav] = useTransition();

  // Search keeps local state for responsive typing; URL updates (debounced).
  const [searchInput, setSearchInput] = useState(filters.q);
  useEffect(() => setSearchInput(filters.q), [filters.q]);

  /** Push lean list params to the URL (date + entity + company + search). */
  function pushParams(next: Partial<ActivityFilters & { page: number }>) {
    const merged = {
      q: filters.q,
      entity: filters.entity,
      company: filters.company,
      scope: filters.scope,
      page,
      ...next,
    };
    const query = buildQuery({
      q: merged.q || undefined,
      entity: merged.entity === 'all' ? undefined : merged.entity,
      company: merged.company === 'all' ? undefined : merged.company,
      // Default scope is `today`; only serialise when it differs.
      date: merged.scope === 'today' ? undefined : merged.scope,
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

  // Group the CURRENT page by local day (rows are already newest-first).
  const grouped = useMemo(() => {
    const map = new Map<string, ActivityRow[]>();
    for (const r of rows) {
      const k = dayKey(r.created_at);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return [...map.entries()];
  }, [rows]);

  const isDefaultScope = filters.scope === 'today';
  const noFilters =
    filters.entity === 'all' && filters.company === 'all' && !filters.q;

  return (
    <div className="space-y-4">
      {/* Attention layer — compact top summary + primary cross-link to Audit.
          The combined sentence is exposed to assistive tech for a one-glance read. */}
      <p className="sr-only">
        {t('activity.summaryToday', { n: summary.today })}
        {t('activity.summarySeparator')}
        {t('activity.summaryWeek', { n: summary.week })}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label={t('activity.statToday')}
          value={String(summary.today)}
          icon={Activity}
          tone="primary"
        />
        <StatCard
          label={t('activity.statWeek')}
          value={String(summary.week)}
          icon={Activity}
          tone="info"
        />
        {/* Primary affordance for forensic detail lives on the Audit Log. */}
        <Card className="transition-colors hover:border-primary/40">
          <Link href="/platform/audit" className="block">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
                <ScrollText className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">{t('activity.viewFullAudit')}</p>
                <p className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                  /platform/audit <ExternalLink className="h-3.5 w-3.5" />
                </p>
              </div>
            </CardContent>
          </Link>
        </Card>
      </div>

      <ListToolbar
        search={searchInput}
        onSearch={setSearchInput}
        placeholder={t('activity.searchPlaceholder')}
        count={rows.length}
        total={total}
        filters={
          <>
            {/* Date scope — the closest thing to a primary action here. */}
            <label className="sr-only" htmlFor="activity-scope">{t('activity.scopeLabel')}</label>
            <Select
              id="activity-scope"
              value={filters.scope}
              onChange={(e) => pushParams({ scope: e.target.value as ActivityDateScope, page: 1 })}
              className="h-9 w-auto"
            >
              <option value="today">{t('activity.scopeToday')}</option>
              <option value="7d">{t('activity.scope7d')}</option>
              <option value="30d">{t('activity.scope30d')}</option>
              <option value="all">{t('activity.scopeAll')}</option>
            </Select>
            <Select
              value={filters.entity}
              onChange={(e) => pushParams({ entity: e.target.value, page: 1 })}
              className="h-9 w-auto"
            >
              <option value="all">{t('activity.filterEntityAll')}</option>
              {options.entities.map((en) => (
                <option key={en} value={en}>{AUDIT_ENTITY_LABELS[en]?.[locale] ?? en}</option>
              ))}
            </Select>
            <Select
              value={filters.company}
              onChange={(e) => pushParams({ company: e.target.value, page: 1 })}
              className="h-9 w-auto"
            >
              <option value="all">{t('activity.filterCompanyAll')}</option>
              {options.companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </>
        }
      />

      <Card>
        <CardContent className="p-0">
          {total === 0 && noFilters && isDefaultScope ? (
            <div className="p-4">
              <EmptyState
                icon={<Activity />}
                title={t('activity.empty')}
                description={t('activity.emptyHint')}
                className="border-0"
              />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<Activity />}
                title={t('activity.noResults')}
                description={t('activity.noResultsHint')}
                className="border-0"
              />
            </div>
          ) : (
            // ── Mobile-first day-grouped timeline (stacked, calm, large taps) ──
            <div className={`p-4 ${navPending ? 'opacity-60 transition-opacity' : ''}`}>
              {grouped.map(([key, dayRows]) => (
                <div key={key} className="mb-6 last:mb-0">
                  <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
                    {dayLabel(dayRows[0].created_at, locale, t('activity.dayToday'), t('activity.dayYesterday'))}
                  </h3>
                  <ol className="relative ms-2 border-s ps-5">
                    {dayRows.map((r) => {
                      const destructive = DESTRUCTIVE.has(r.action);
                      const companyName = r.company_id ? companyNames[r.company_id] ?? null : null;
                      return (
                        <li key={r.id} className="relative mb-5 last:mb-0">
                          <span
                            className={`absolute -start-[1.4rem] top-2 h-2.5 w-2.5 rounded-full ring-2 ring-background ${destructive ? 'bg-destructive' : 'bg-primary'}`}
                          />
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            {/* Relative time; absolute timestamp on hover. */}
                            <Tooltip label={absoluteTime(r.created_at)}>
                              <span className="text-xs tabular-nums text-muted-foreground" dir="ltr">
                                {relativeTime(r.created_at, locale)}
                              </span>
                            </Tooltip>
                            <Badge variant={destructive ? 'destructive' : 'secondary'}>
                              {AUDIT_ENTITY_LABELS[r.entity]?.[locale] ?? r.entity}
                            </Badge>
                            {/* Company chip (or the platform-level marker). */}
                            <span className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">
                              <Building2 className="h-3 w-3" />
                              {companyName ?? t('activity.platformLabel')}
                            </span>
                          </div>
                          <p className="mt-1 text-sm leading-relaxed">
                            {describeAuditEvent(r, { locale, companyName })}
                          </p>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ))}
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
