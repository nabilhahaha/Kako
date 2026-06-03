'use client';

import { useMemo, useState } from 'react';
import { ScrollText, Table2, GitCommitVertical } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Tooltip } from '@/components/ui/tooltip';
import { ListToolbar } from '@/components/shared/list-toolbar';
import { EmptyState } from '@/components/shared/empty-state';
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

// NOTE: server-side pagination is a future gap — the page currently fetches a
// bounded window (see audit/page.tsx limit) and all filtering happens client-side.

const DESTRUCTIVE = AUDIT_DESTRUCTIVE_ACTIONS;
type DateFilter = 'all' | 'today' | '7d' | '30d';
type ViewMode = 'table' | 'timeline';

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
}: {
  rows: AuditRow[];
  companyNames: Record<string, string>;
}) {
  const { t, locale } = useI18n();
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');
  const [actorFilter, setActorFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [view, setView] = useState<ViewMode>('table');

  const actions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.action))).sort(),
    [rows],
  );
  const entities = useMemo(
    () => Array.from(new Set(rows.map((r) => r.entity))).sort(),
    [rows],
  );
  const actors = useMemo(
    () => Array.from(new Set(rows.map((r) => r.actor_email).filter((e): e is string => !!e))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = Date.now();
    const cutoff =
      dateFilter === 'today' ? now - 86_400_000
      : dateFilter === '7d' ? now - 7 * 86_400_000
      : dateFilter === '30d' ? now - 30 * 86_400_000
      : null;
    return rows.filter((r) => {
      if (actionFilter !== 'all' && r.action !== actionFilter) return false;
      if (entityFilter !== 'all' && r.entity !== entityFilter) return false;
      if (actorFilter !== 'all' && r.actor_email !== actorFilter) return false;
      if (cutoff !== null) {
        const ts = new Date(r.created_at).getTime();
        if (Number.isNaN(ts) || ts < cutoff) return false;
      }
      if (q) {
        const hay = `${r.actor_email ?? ''} ${r.entity_id ?? ''} ${r.details ? JSON.stringify(r.details) : ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, actionFilter, entityFilter, actorFilter, dateFilter]);

  // Group filtered rows by local day for the timeline view (filtered is already
  // newest-first from the server query).
  const grouped = useMemo(() => {
    const map = new Map<string, AuditRow[]>();
    for (const r of filtered) {
      const k = dayKey(r.created_at);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <div className="space-y-4">
      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder={t('platform.audit.searchPlaceholder')}
        count={filtered.length}
        total={rows.length}
        filters={
          <>
            <Select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="h-9 w-auto">
              <option value="all">{t('platform.audit.filterActionAll')}</option>
              {actions.map((a) => (
                <option key={a} value={a}>{AUDIT_ACTION_LABELS[a]?.[locale] ?? a}</option>
              ))}
            </Select>
            <Select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} className="h-9 w-auto">
              <option value="all">{t('platform.audit.filterEntityAll')}</option>
              {entities.map((en) => (
                <option key={en} value={en}>{AUDIT_ENTITY_LABELS[en]?.[locale] ?? en}</option>
              ))}
            </Select>
            <Select value={actorFilter} onChange={(e) => setActorFilter(e.target.value)} className="h-9 w-auto">
              <option value="all">{t('platform.audit.filterActorAll')}</option>
              {actors.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </Select>
            <Select value={dateFilter} onChange={(e) => setDateFilter(e.target.value as DateFilter)} className="h-9 w-auto">
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

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-4">
              <EmptyState icon={<ScrollText />} title={t('platform.audit.empty')} className="border-0" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<ScrollText />}
                title={t('platform.audit.noResults')}
                description={t('platform.audit.noResultsHint')}
                className="border-0"
              />
            </div>
          ) : view === 'table' ? (
            <div className="overflow-x-auto">
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
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-b align-top">
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
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            // ── Timeline view: grouped by day, vertical dot + time + sentence ──
            <div className="p-4">
              {grouped.map(([key, dayRows]) => (
                <div key={key} className="mb-6 last:mb-0">
                  <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
                    {dayLabel(dayRows[0].created_at, locale, t('platform.audit.dayToday'), t('platform.audit.dayYesterday'))}
                  </h3>
                  <ol className="relative ms-2 border-s ps-5">
                    {dayRows.map((r) => {
                      const destructive = DESTRUCTIVE.has(r.action);
                      return (
                        <li key={r.id} className="relative mb-4 last:mb-0">
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
                          <div className="mt-1">
                            <DetailChips details={r.details} />
                          </div>
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
    </div>
  );
}
