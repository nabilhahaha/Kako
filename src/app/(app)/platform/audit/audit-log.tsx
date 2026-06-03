'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ScrollText, Table2, GitCommitVertical, ChevronDown, ChevronRight, Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Tooltip } from '@/components/ui/tooltip';
import { ListToolbar } from '@/components/shared/list-toolbar';
import { Pagination } from '@/components/shared/pagination';
import { EmptyState } from '@/components/shared/empty-state';
import { buildQuery } from '@/lib/list-params';
import { useI18n } from '@/lib/i18n/provider';
import {
  AUDIT_ACTION_LABELS, AUDIT_ENTITY_LABELS, AUDIT_DESTRUCTIVE_ACTIONS, describeAuditEvent,
} from '@/lib/erp/audit';

export interface AuditRow {
  id: string;
  actor_email: string | null;
  company_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

const DESTRUCTIVE = AUDIT_DESTRUCTIVE_ACTIONS;
export type AuditDateFilter = 'all' | 'today' | '7d' | '30d';
type ViewMode = 'table' | 'timeline';

export interface AuditListFilters {
  q: string;
  action: string;
  entity: string;
  actor: string;
  date: AuditDateFilter;
}

export interface AuditFilterOptions {
  actions: string[];
  entities: string[];
  actors: string[];
}

/** Stable day key (local) used to group timeline events. */
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

function timeOnly(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-GB', { timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function relativeTime(iso: string, locale: 'en' | 'ar'): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffMs = Date.now() - then;
  const sec = Math.round(diffMs / 1000);
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

function absoluteTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

/** Render audit `details` as compact key→value chips instead of raw JSON. */
function DetailChips({ details }: { details: Record<string, unknown> | null }) {
  if (!details || Object.keys(details).length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {Object.entries(details).map(([k, v]) => {
        const val = v === null || v === undefined
          ? '—'
          : typeof v === 'object'
            ? JSON.stringify(v)
            : String(v);
        return (
          <span
            key={k}
            className="inline-flex max-w-[18rem] items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-xs"
          >
            <span className="font-medium text-muted-foreground" dir="ltr">{k}</span>
            <span className="truncate" dir="ltr" title={val}>{val}</span>
          </span>
        );
      })}
    </div>
  );
}

export function AuditLog({
  rows,
  companyNames,
  total,
  page,
  pageSize,
  filters,
  options,
  event,
  eventInPage,
}: {
  rows: AuditRow[];
  companyNames: Record<string, string>;
  total: number;
  page: number;
  pageSize: number;
  filters: AuditListFilters;
  options: AuditFilterOptions;
  event: string | null;
  eventInPage: boolean;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [navPending, startNav] = useTransition();

  // Default to the human-readable Timeline (T1); Table is one tap away (T2).
  const [view, setView] = useState<ViewMode>('timeline');

  // Search box keeps local state for responsive typing; URL updates (debounced).
  const [searchInput, setSearchInput] = useState(filters.q);
  useEffect(() => setSearchInput(filters.q), [filters.q]);

  /** Push new list params (preserving an in-page ?event= deep link). */
  function pushParams(next: Partial<AuditListFilters & { page: number }>) {
    const merged = {
      q: filters.q,
      action: filters.action,
      entity: filters.entity,
      actor: filters.actor,
      date: filters.date,
      page,
      ...next,
    };
    const query = buildQuery({
      q: merged.q || undefined,
      action: merged.action === 'all' ? undefined : merged.action,
      entity: merged.entity === 'all' ? undefined : merged.entity,
      actor: merged.actor === 'all' ? undefined : merged.actor,
      date: merged.date === 'all' ? undefined : merged.date,
      page: merged.page > 1 ? merged.page : undefined,
      event: eventInPage && searchParams?.get('event') ? searchParams.get('event')! : undefined,
    });
    startNav(() => router.push(`${pathname}${query}`));
  }

  // Debounce search → URL (~300ms).
  useEffect(() => {
    if (searchInput === filters.q) return;
    const id = window.setTimeout(() => {
      pushParams({ q: searchInput, page: 1 });
    }, 300);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // ── deep-link: ?event={id} (read-only) — auto-expand/highlight/scroll. ──────
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map());
  const didDeepLink = useRef(false);

  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Group the CURRENT page by local day for the timeline view (rows are already
  // newest-first from the server query).
  const grouped = useMemo(() => {
    const map = new Map<string, AuditRow[]>();
    for (const r of rows) {
      const k = dayKey(r.created_at);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return [...map.entries()];
  }, [rows]);

  // On first render with a ?event= on the current page, expand its details,
  // highlight it, then scroll it into view.
  useEffect(() => {
    if (didDeepLink.current) return;
    if (!event || !eventInPage) return;
    didDeepLink.current = true;
    setExpandedRows((prev) => new Set(prev).add(event));
    setHighlightId(event);
    const id = window.setTimeout(() => {
      rowRefs.current.get(event)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
    return () => window.clearTimeout(id);
  }, [event, eventInPage]);

  return (
    <div className="space-y-4">
      <ListToolbar
        search={searchInput}
        onSearch={setSearchInput}
        placeholder={t('platform.audit.searchPlaceholder')}
        count={rows.length}
        total={total}
        filters={
          <>
            <Select value={filters.action} onChange={(e) => pushParams({ action: e.target.value, page: 1 })} className="h-9 w-auto">
              <option value="all">{t('platform.audit.filterActionAll')}</option>
              {options.actions.map((a) => (
                <option key={a} value={a}>{AUDIT_ACTION_LABELS[a]?.[locale] ?? a}</option>
              ))}
            </Select>
            <Select value={filters.entity} onChange={(e) => pushParams({ entity: e.target.value, page: 1 })} className="h-9 w-auto">
              <option value="all">{t('platform.audit.filterEntityAll')}</option>
              {options.entities.map((en) => (
                <option key={en} value={en}>{AUDIT_ENTITY_LABELS[en]?.[locale] ?? en}</option>
              ))}
            </Select>
            <Select value={filters.actor} onChange={(e) => pushParams({ actor: e.target.value, page: 1 })} className="h-9 w-auto">
              <option value="all">{t('platform.audit.filterActorAll')}</option>
              {options.actors.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </Select>
            <Select value={filters.date} onChange={(e) => pushParams({ date: e.target.value as AuditDateFilter, page: 1 })} className="h-9 w-auto">
              <option value="all">{t('platform.audit.filterDateAll')}</option>
              <option value="today">{t('platform.audit.filterDateToday')}</option>
              <option value="7d">{t('platform.audit.filterDate7d')}</option>
              <option value="30d">{t('platform.audit.filterDate30d')}</option>
            </Select>
            <div className="inline-flex overflow-hidden rounded-md border">
              <Button
                type="button"
                variant={view === 'table' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-9 rounded-none border-0"
                onClick={() => setView('table')}
                aria-pressed={view === 'table'}
              >
                <Table2 className="h-4 w-4" /> {t('platform.audit.viewTable')}
              </Button>
              <Button
                type="button"
                variant={view === 'timeline' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-9 rounded-none border-0"
                onClick={() => setView('timeline')}
                aria-pressed={view === 'timeline'}
              >
                <GitCommitVertical className="h-4 w-4" /> {t('platform.audit.viewTimeline')}
              </Button>
            </div>
          </>
        }
      />

      {event && !eventInPage && (
        <div className="flex items-center gap-2 rounded-md border border-info/40 bg-info/5 px-3 py-2 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0 text-info" />
          {t('platform.audit.eventNotInWindow')}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {total === 0 && !filters.q && filters.action === 'all' && filters.entity === 'all' && filters.actor === 'all' && filters.date === 'all' ? (
            <div className="p-4">
              <EmptyState icon={<ScrollText />} title={t('platform.audit.empty')} className="border-0" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<ScrollText />}
                title={t('platform.audit.noResults')}
                description={t('platform.audit.noResultsHint')}
                className="border-0"
              />
            </div>
          ) : view === 'table' ? (
            <div className={`overflow-x-auto ${navPending ? 'opacity-60 transition-opacity' : ''}`}>
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="whitespace-nowrap p-3 text-start font-medium">{t('platform.audit.thTime')}</th>
                    <th className="p-3 text-start font-medium">{t('platform.audit.thSummary')}</th>
                    <th className="p-3 text-start font-medium">{t('platform.audit.thAction')}</th>
                    <th className="p-3 text-start font-medium">{t('platform.audit.thEntity')}</th>
                    <th className="p-3 text-start font-medium">{t('platform.audit.thCompany')}</th>
                    <th className="p-3 text-start font-medium">{t('platform.audit.thDetails')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const isHighlighted = highlightId === r.id;
                    return (
                      <tr
                        key={r.id}
                        ref={(el) => {
                          if (el) rowRefs.current.set(r.id, el);
                          else rowRefs.current.delete(r.id);
                        }}
                        className={`border-b align-top ${isHighlighted ? 'bg-warning/10' : ''}`}
                      >
                        <td className="whitespace-nowrap p-3 text-muted-foreground">
                          <Tooltip label={absoluteTime(r.created_at)}>
                            <span dir="ltr">{relativeTime(r.created_at, locale)}</span>
                          </Tooltip>
                        </td>
                        <td className="max-w-[24rem] p-3">
                          {describeAuditEvent(r, {
                            locale,
                            companyName: r.company_id ? companyNames[r.company_id] ?? null : null,
                          })}
                        </td>
                        <td className="p-3">
                          <Badge variant={DESTRUCTIVE.has(r.action) ? 'destructive' : 'secondary'}>
                            {AUDIT_ACTION_LABELS[r.action]?.[locale] ?? r.action}
                          </Badge>
                        </td>
                        <td className="p-3">
                          {AUDIT_ENTITY_LABELS[r.entity]?.[locale] ?? r.entity}
                          {r.entity_id && (
                            <span className="block text-xs text-muted-foreground" dir="ltr">{r.entity_id}</span>
                          )}
                        </td>
                        <td className="p-3">{r.company_id ? companyNames[r.company_id] ?? '—' : '—'}</td>
                        <td className="p-3">
                          <DetailChips details={r.details} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            // ── Timeline view: groups the CURRENT page by day ──
            <div className={`p-4 ${navPending ? 'opacity-60 transition-opacity' : ''}`}>
              {grouped.map(([key, dayRows]) => (
                <div key={key} className="mb-6 last:mb-0">
                  <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
                    {dayLabel(dayRows[0].created_at, locale, t('platform.audit.dayToday'), t('platform.audit.dayYesterday'))}
                  </h3>
                  <ol className="relative ms-2 border-s ps-5">
                    {dayRows.map((r) => {
                      const destructive = DESTRUCTIVE.has(r.action);
                      const hasDetails = !!r.details && Object.keys(r.details).length > 0;
                      const isOpen = expandedRows.has(r.id);
                      const isHighlighted = highlightId === r.id;
                      return (
                        <li
                          key={r.id}
                          ref={(el) => {
                            if (el) rowRefs.current.set(r.id, el);
                            else rowRefs.current.delete(r.id);
                          }}
                          className={`relative mb-4 rounded-md last:mb-0 ${isHighlighted ? 'bg-warning/10 ring-1 ring-warning/40' : ''}`}
                        >
                          <span
                            className={`absolute -start-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-background ${destructive ? 'bg-destructive' : 'bg-primary'}`}
                          />
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            <span className="text-xs tabular-nums text-muted-foreground" dir="ltr">
                              {timeOnly(r.created_at)}
                            </span>
                            <Badge variant={destructive ? 'destructive' : 'secondary'}>
                              {AUDIT_ENTITY_LABELS[r.entity]?.[locale] ?? r.entity}
                            </Badge>
                          </div>
                          <p className="mt-0.5 text-sm">
                            {describeAuditEvent(r, {
                              locale,
                              companyName: r.company_id ? companyNames[r.company_id] ?? null : null,
                            })}
                          </p>
                          {/* Detail chips are T3 — behind a tap to keep the timeline calm. */}
                          {hasDetails && (
                            <div className="mt-1">
                              <button
                                type="button"
                                onClick={() => toggleRow(r.id)}
                                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                                aria-expanded={isOpen}
                              >
                                {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />}
                                {t('platform.audit.thDetails')}
                              </button>
                              {isOpen && (
                                <div className="mt-1">
                                  <DetailChips details={r.details} />
                                </div>
                              )}
                            </div>
                          )}
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
