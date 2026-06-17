import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission, type Permission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { isVanSalesActive } from '@/lib/van-sales/settings-server';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { loadOverrideHistory } from '@/lib/van-sales/override-server';

export const dynamic = 'force-dynamic';

const PERMS: Permission[] = ['audit.view', 'returns.override', 'day.close.override', 'day.reopen', 'reports.view'];

// Override & Reopen history (audit-backed): counts, top override users, reasons,
// and the full trail. Gated by audit.view / any override permission / reports.view.
export default async function OverrideHistoryPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) notFound();
  if (!PERMS.some((p) => hasPermission(ctx, p)) && !ctx.isSuperAdmin) redirect('/dashboard');

  const { t, locale } = await getT();
  const intl = INTL_LOCALE[locale];
  const sp = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const from = sp.from || monthAgo;
  const to = sp.to || today;
  const res = await loadOverrideHistory({ from, to });
  const ol = (k: string) => t(`override.${k}`);
  const d = res.ok ? res.data! : null;
  const actionLabel = (a: string) => ol(`act_${a.replace(/\./g, '_')}`) || a;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <BackLink href="/field/van-sales/override-center" label={t('common.back')} />
      <PageHeader title={ol('historyTitle')} description={ol('historySubtitle')} />

      <Card><CardContent className="pt-5">
        <form className="flex flex-wrap items-end gap-3" method="get">
          <label className="space-y-1 text-xs"><span className="block text-muted-foreground">{ol('from')}</span>
            <input type="date" name="from" defaultValue={from} className="rounded-md border bg-background px-2 py-1.5 text-sm" /></label>
          <label className="space-y-1 text-xs"><span className="block text-muted-foreground">{ol('to')}</span>
            <input type="date" name="to" defaultValue={to} className="rounded-md border bg-background px-2 py-1.5 text-sm" /></label>
          <button type="submit" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">{ol('apply')}</button>
        </form>
      </CardContent></Card>

      {!d ? (
        <Card><CardContent className="pt-6 text-sm text-destructive">{res.ok ? ol('empty') : res.error}</CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label={ol('act_van_return_override_approve')} value={String(d.counts.returnApprove)} />
            <Kpi label={ol('act_van_return_override_reject')} value={String(d.counts.returnReject)} />
            <Kpi label={ol('act_day_close_override')} value={String(d.counts.dayClose)} />
            <Kpi label={ol('act_day_close_reopen')} value={String(d.counts.dayReopen)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Card><CardContent className="pt-5">
              <h2 className="mb-2 text-sm font-semibold">{ol('topUsers')}</h2>
              {d.topUsers.length === 0 ? <p className="text-xs text-muted-foreground">—</p> : (
                <ul className="divide-y text-sm">{d.topUsers.map((u) => (
                  <li key={u.actor} className="flex items-center justify-between py-1.5"><span className="truncate">{u.actor}</span><span className="tabular-nums font-medium">{u.count}</span></li>
                ))}</ul>
              )}
            </CardContent></Card>
            <Card><CardContent className="pt-5">
              <h2 className="mb-2 text-sm font-semibold">{ol('overrideReasons')}</h2>
              {d.reasons.length === 0 ? <p className="text-xs text-muted-foreground">—</p> : (
                <ul className="divide-y text-sm">{d.reasons.map((r) => (
                  <li key={r.reason} className="flex items-center justify-between gap-2 py-1.5"><span className="min-w-0 flex-1 truncate">{r.reason}</span><span className="tabular-nums font-medium">{r.count}</span></li>
                ))}</ul>
              )}
            </CardContent></Card>
          </div>

          <Card><CardContent className="pt-5">
            <h2 className="mb-3 text-sm font-semibold">{ol('historyTrail')}</h2>
            {d.history.length === 0 ? <p className="text-center text-xs text-muted-foreground">{ol('empty')}</p> : (
              <ul className="divide-y text-sm">{d.history.map((h, i) => (
                <li key={i} className="py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{actionLabel(h.action)}</span>
                    <span className="text-xs text-muted-foreground" dir="ltr">{new Date(h.at).toLocaleString(intl)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{h.actor}{h.reason ? ` — ${h.reason}` : ''}</div>
                </li>
              ))}</ul>
            )}
          </CardContent></Card>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="pt-5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
    </CardContent></Card>
  );
}
