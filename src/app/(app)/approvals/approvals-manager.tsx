'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Inbox, Clock, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { ListToolbar } from '@/components/shared/list-toolbar';
import { Pagination } from '@/components/shared/pagination';
import { EmptyState } from '@/components/shared/empty-state';
import { StatCard } from '@/components/shared/stat-card';
import { buildQuery } from '@/lib/list-params';
import { useI18n } from '@/lib/i18n/provider';
import { type TFunc } from '@/lib/i18n';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { formatDate, cn } from '@/lib/utils';
import { decideTask } from './actions';

export interface TaskRow {
  id: string;
  entity: string;
  recordId: string;
  recordLabel: string;
  requester: string;
  company: string;
  status: 'pending' | 'approved' | 'rejected';
  stepNo: number;
  createdAt: string;
  decidedAt: string | null;
  comment: string | null;
  overdue?: boolean;
  escalated?: boolean;
}

export interface ApprovalsFilters {
  q: string;
  status: string;
  entity: string;
}

/** Plain-language relative age (calm, no-precision). Falls back to "just now". */
function relativeAge(iso: string, t: TFunc): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return t('workflow.inbox.justNow');
  if (mins < 60) return t('workflow.inbox.rel.minutes', { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('workflow.inbox.rel.hours', { n: hours });
  return t('workflow.inbox.rel.days', { n: Math.floor(hours / 24) });
}

export function ApprovalsManager({
  tasks,
  total,
  pendingTotal,
  page,
  pageSize,
  filters,
  entityOptions,
}: {
  tasks: TaskRow[];
  total: number;
  pendingTotal: number;
  page: number;
  pageSize: number;
  filters: ApprovalsFilters;
  entityOptions: string[];
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [navPending, startNav] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [showReason, setShowReason] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  // Search box keeps local state for responsive typing; URL updates (debounced).
  const [searchInput, setSearchInput] = useState(filters.q);
  useEffect(() => setSearchInput(filters.q), [filters.q]);

  /** Push new list params, resetting to page 1 for any filter change. */
  function pushParams(next: Partial<ApprovalsFilters & { page: number }>) {
    const merged = { q: filters.q, status: filters.status, entity: filters.entity, page, ...next };
    const query = buildQuery({
      q: merged.q || undefined,
      status: merged.status === 'pending' ? undefined : merged.status,
      entity: merged.entity === 'all' ? undefined : merged.entity,
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

  const entityLabel = (e: string) => (e ? t(`workflow.entity.${e}`) : '') || e;

  // Pending rows on this page are the ones eligible for selection / bulk approve.
  const pendingIds = useMemo(() => tasks.filter((r) => r.status === 'pending').map((r) => r.id), [tasks]);
  const selectedIds = useMemo(() => pendingIds.filter((id) => selected[id]), [pendingIds, selected]);
  const allSelected = pendingIds.length > 0 && selectedIds.length === pendingIds.length;

  function toggleAll() {
    if (allSelected) return setSelected({});
    const next: Record<string, boolean> = {};
    for (const id of pendingIds) next[id] = true;
    setSelected(next);
  }

  async function decide(id: string, decision: 'approve' | 'reject') {
    if (decision === 'reject' && !(reasons[id] && reasons[id].trim())) {
      setShowReason((s) => ({ ...s, [id]: true }));
      return toast.error(t('workflow.rejectReasonRequired'));
    }
    setBusy(id);
    try {
      const res = await decideTask(id, decision, reasons[id]);
      if (!res.ok)
        return toast.error(
          res.error === 'rejection_reason_required'
            ? t('workflow.rejectReasonRequired')
            : res.error ?? t('workflow.toast.error'),
        );
      toast.success(decision === 'approve' ? t('workflow.toast.approved') : t('workflow.toast.rejected'));
      setSelected((s) => ({ ...s, [id]: false }));
    } catch {
      toast.error(t('workflow.toast.error'));
    } finally {
      setBusy(null);
    }
  }

  /** Bulk approve — trivially composable: approve needs no reason, so we just
   *  call the existing per-task action for each selected pending task. */
  async function bulkApprove() {
    if (selectedIds.length === 0) return;
    setBulkBusy(true);
    let ok = 0;
    let failed = 0;
    try {
      for (const id of selectedIds) {
        try {
          const res = await decideTask(id, 'approve');
          res.ok ? ok++ : failed++;
        } catch {
          failed++;
        }
      }
      if (failed === 0) toast.success(t('workflow.toast.bulkApproved', { n: ok }));
      else toast.error(t('workflow.toast.bulkPartial', { ok, total: selectedIds.length, failed }));
      setSelected({});
    } finally {
      setBulkBusy(false);
    }
  }

  const filtersActive = !!filters.q || filters.status !== 'pending' || filters.entity !== 'all';

  function statusBadge(r: TaskRow) {
    if (r.status === 'approved')
      return <Badge variant="success">{t('workflow.inbox.decidedApproved')}</Badge>;
    if (r.status === 'rejected')
      return <Badge variant="destructive">{t('workflow.inbox.decidedRejected')}</Badge>;
    if (r.escalated) return <Badge variant="destructive">{t('workflow.escalated')}</Badge>;
    if (r.overdue) return <Badge variant="warning">{t('workflow.overdue')}</Badge>;
    return <Badge variant="secondary">{t('workflow.inbox.decidedPending')}</Badge>;
  }

  function renderRow(r: TaskRow) {
    const isPending = r.status === 'pending';
    const reasonOpen = !!showReason[r.id];
    const summary = r.requester
      ? t('workflow.inbox.summary', { requester: r.requester, entity: entityLabel(r.entity), name: r.recordLabel })
      : t('workflow.inbox.summaryNoRequester', { entity: entityLabel(r.entity), name: r.recordLabel });

    return (
      <div
        key={r.id}
        className={cn(
          'rounded-lg border p-4 transition-colors',
          isPending && (r.escalated || r.overdue) ? 'border-warning/50 bg-warning/5' : 'border-border',
          !isPending && 'opacity-75',
        )}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            {isPending && (
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 shrink-0 accent-primary"
                checked={!!selected[r.id]}
                aria-label={t('workflow.inbox.selectTask')}
                onChange={(e) => setSelected((s) => ({ ...s, [r.id]: e.target.checked }))}
              />
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{entityLabel(r.entity)}</Badge>
                {statusBadge(r)}
              </div>
              <p className="mt-1.5 text-sm font-medium">{summary}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {r.company && <span>{t('workflow.inbox.company', { name: r.company })}</span>}
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" aria-hidden />
                  {relativeAge(r.createdAt, t)}
                </span>
                <span dir="ltr">{t('workflow.step', { n: r.stepNo })}</span>
                {!isPending && r.decidedAt && (
                  <span dir="ltr">
                    {t('workflow.inbox.decidedAt', { time: formatDate(r.decidedAt, INTL_LOCALE[locale]) })}
                  </span>
                )}
              </div>
              {!isPending && r.comment && (
                <p className="mt-1.5 text-xs text-muted-foreground">{r.comment}</p>
              )}
            </div>
          </div>

          {isPending && (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy === r.id || bulkBusy}
                onClick={() => (reasonOpen ? decide(r.id, 'reject') : setShowReason((s) => ({ ...s, [r.id]: true })))}
              >
                <XCircle className="h-4 w-4 text-destructive" /> {t('workflow.reject')}
              </Button>
              {/* The one primary action: approve is the dominant emphasized button. */}
              <Button size="sm" disabled={busy === r.id || bulkBusy} onClick={() => decide(r.id, 'approve')}>
                <CheckCircle2 className="h-4 w-4" /> {t('workflow.approve')}
              </Button>
            </div>
          )}
        </div>

        {isPending && reasonOpen && (
          <div className="mt-3 space-y-1">
            <Input
              autoFocus
              className="h-9"
              placeholder={t('workflow.inbox.reasonLabel')}
              value={reasons[r.id] ?? ''}
              onChange={(e) => setReasons((c) => ({ ...c, [r.id]: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">{t('workflow.inbox.reasonRequiredHint')}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label={t('workflow.inbox.pendingCount')}
          value={String(pendingTotal)}
          icon={pendingTotal > 0 ? AlertTriangle : Inbox}
          tone={pendingTotal > 0 ? 'warning' : 'success'}
        />
      </div>

      <ListToolbar
        search={searchInput}
        onSearch={setSearchInput}
        placeholder={t('workflow.inbox.searchPlaceholder')}
        count={tasks.length}
        total={total}
        filters={
          <>
            <Select
              value={filters.status}
              onChange={(e) => pushParams({ status: e.target.value, page: 1 })}
              className="h-9 w-auto"
              aria-label={t('workflow.inbox.statusLabel')}
            >
              <option value="pending">{t('workflow.inbox.statusPending')}</option>
              <option value="approved">{t('workflow.inbox.statusApproved')}</option>
              <option value="rejected">{t('workflow.inbox.statusRejected')}</option>
              <option value="all">{t('workflow.inbox.statusAll')}</option>
            </Select>
            <Select
              value={filters.entity}
              onChange={(e) => pushParams({ entity: e.target.value, page: 1 })}
              className="h-9 w-auto"
            >
              <option value="all">{t('workflow.inbox.entityAll')}</option>
              {entityOptions.map((e) => (
                <option key={e} value={e}>{entityLabel(e)}</option>
              ))}
            </Select>
          </>
        }
        actions={
          pendingIds.length > 0 ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9"
                aria-pressed={allSelected}
                onClick={toggleAll}
              >
                {t('workflow.inbox.selectAll')}
              </Button>
              <Button
                size="sm"
                variant="default"
                disabled={bulkBusy || selectedIds.length === 0}
                onClick={bulkApprove}
              >
                <CheckCircle2 className="h-4 w-4" /> {t('workflow.inbox.bulkApprove', { n: selectedIds.length })}
              </Button>
            </>
          ) : undefined
        }
      />

      <Card>
        <CardContent className={cn('p-4', navPending && 'opacity-60 transition-opacity')}>
          {tasks.length === 0 ? (
            <EmptyState
              icon={<Inbox />}
              title={filtersActive ? t('workflow.inbox.noResultsTitle') : t('workflow.inbox.emptyTitle')}
              description={filtersActive ? t('workflow.inbox.noResultsHint') : t('workflow.inbox.emptyDescription')}
              className="border-0"
            />
          ) : (
            <div className="space-y-3">{tasks.map(renderRow)}</div>
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
