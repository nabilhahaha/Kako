import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { AlertCard, type Alert } from './alert-card';
import { RunDetection } from './run-detection';

const ACTIVE = ['open', 'acknowledged', 'in_progress'];
const STATUS_TABS = ['active', 'open', 'acknowledged', 'in_progress', 'resolved', 'dismissed'] as const;
const SEVERITIES = ['critical', 'warning', 'info'] as const;
const CATEGORIES = ['coverage', 'compliance', 'oos', 'opportunity', 'customer_risk'] as const;

type SP = { status?: string; severity?: string; category?: string; owner?: string };
type Summary = { open: number; critical: number; warning: number; overdue: number; unowned: number };

/** FE-5e-4 — mobile-first, scope-aware alerts inbox. Lifecycle, severity/owner
 *  filters, due + overdue + aging visibility, drill-through and quick actions. */
export default async function AlertsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.company?.id || !ctx.modules.includes('field_ops')) {
    return <div><PageHeader title={t('field.alerts.title')} /><Card><CardContent className="p-8 text-center text-muted-foreground">{t('field.alerts.noAccess')}</CardContent></Card></div>;
  }
  const sp = await searchParams;
  const status = sp.status && STATUS_TABS.includes(sp.status as (typeof STATUS_TABS)[number]) ? sp.status : 'active';
  const isAdmin = ctx.isPlatformOwner || ctx.isSuperAdmin || ctx.topRole === 'admin';
  const supabase = await createClient();

  const statusArg = status === 'active' ? ACTIVE : [status];
  const ownerArg = sp.owner === 'mine' ? ctx.userId : null;
  let alerts: Alert[] = [];
  let summary: Summary | null = null;
  try {
    const [{ data: list }, { data: sum }] = await Promise.all([
      supabase.rpc('erp_fe_alerts_list', { p_status: statusArg, p_category: sp.category ?? null, p_severity: sp.severity ?? null, p_owner: ownerArg, p_limit: 200 }),
      supabase.rpc('erp_fe_alerts_summary'),
    ]);
    alerts = (list as Alert[]) ?? [];
    summary = (sum as Summary) ?? null;
  } catch {
    return <div><PageHeader title={t('field.alerts.title')} /><Card><CardContent className="p-8 text-center text-muted-foreground">{t('field.alerts.noAccess')}</CardContent></Card></div>;
  }

  // build a query string preserving the other filters
  const qs = (patch: Partial<SP>) => {
    const merged: SP = { status, severity: sp.severity, category: sp.category, owner: sp.owner, ...patch };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v && !(k === 'status' && v === 'active')) p.set(k, v);
    const s = p.toString();
    return s ? `/field/alerts?${s}` : '/field/alerts';
  };
  const chip = (active: boolean) =>
    `whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium ${active ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background text-muted-foreground'}`;

  return (
    <div className="mx-auto max-w-2xl space-y-3 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageHeader title={t('field.alerts.title')} />
        <div className="flex items-center gap-3">
          <Link href="/field/alerts/digest" className="text-xs font-medium text-primary hover:underline">{t('field.alerts.digestLink')}</Link>
          {isAdmin && <RunDetection />}
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-4 gap-2">
          <Kpi label={t('field.alerts.open')} value={summary.open} />
          <Kpi label={t('field.alerts.critical')} value={summary.critical} tone="text-red-600" />
          <Kpi label={t('field.alerts.overdue')} value={summary.overdue} tone="text-amber-600" />
          <Kpi label={t('field.alerts.unowned')} value={summary.unowned} />
        </div>
      )}

      {/* status tabs */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {STATUS_TABS.map((s) => (
          <Link key={s} href={qs({ status: s })} className={chip(status === s)}>
            {s === 'active' ? t('field.alerts.open') : t(`field.alerts.status.${s}`)}
          </Link>
        ))}
      </div>
      {/* severity + owner + category filters */}
      <div className="-mx-1 flex flex-wrap gap-1.5 px-1">
        <Link href={qs({ severity: undefined })} className={chip(!sp.severity)}>{t('field.alerts.filterSeverity')}: {t('field.alerts.all')}</Link>
        {SEVERITIES.map((s) => <Link key={s} href={qs({ severity: s })} className={chip(sp.severity === s)}>{t(`field.alerts.${s}`)}</Link>)}
        <Link href={qs({ owner: sp.owner === 'mine' ? undefined : 'mine' })} className={chip(sp.owner === 'mine')}>{t('field.alerts.mine')}</Link>
      </div>
      <div className="-mx-1 flex flex-wrap gap-1.5 px-1">
        <Link href={qs({ category: undefined })} className={chip(!sp.category)}>{t('field.alerts.filterCategory')}: {t('field.alerts.all')}</Link>
        {CATEGORIES.map((c) => <Link key={c} href={qs({ category: c })} className={chip(sp.category === c)}>{t(`field.alerts.category.${c}`)}</Link>)}
      </div>

      {alerts.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{t('field.alerts.empty')}</CardContent></Card>
      ) : (
        <div className="space-y-2">{alerts.map((a) => <AlertCard key={a.id} alert={a} currentUserId={ctx.userId} />)}</div>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <Card><CardContent className="p-2.5 text-center">
      <div className={`text-xl font-semibold tabular-nums ${tone ?? ''}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </CardContent></Card>
  );
}
