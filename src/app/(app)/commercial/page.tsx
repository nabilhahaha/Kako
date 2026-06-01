import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getT } from '@/lib/i18n/server';
import { MonthPicker } from './month-picker';

interface Block { actual: number; target: number | null; achievement: number | null; rag: string | null; prior: number; prior_growth: number | null; yoy: number; yoy_growth: number | null }
interface Row { key: string; label: string; value: Block; qty: Block }
type SP = { month?: string; group?: string; source?: string; rep?: string; route?: string; branch?: string; region?: string; area?: string; channel?: string; classification?: string; category?: string };

const GEO = ['region', 'area', 'branch', 'route', 'rep', 'customer'] as const;
const PROD = ['category', 'subcategory', 'brand', 'sku'] as const;
const OTHER = ['channel', 'classification'] as const;
const GEO_NEXT: Record<string, { next: string; param: keyof SP }> = {
  region: { next: 'area', param: 'region' }, area: { next: 'branch', param: 'area' }, branch: { next: 'route', param: 'branch' },
  route: { next: 'rep', param: 'route' }, rep: { next: 'customer', param: 'rep' },
};
const ragColor: Record<string, string> = { green: 'bg-green-500', amber: 'bg-amber-500', red: 'bg-red-500' };

function firstOfMonth(d?: string) { const x = d ? new Date(d) : new Date(); return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-01`; }
function rag(ach: number | null, green: number, amber: number) { return ach == null ? null : ach >= green ? 'green' : ach >= amber ? 'amber' : 'red'; }
const n2 = (n: number) => Math.round(n).toLocaleString();

/** CP-6 — mobile-first commercial dashboard: 10 KPI cards, RAG, drill-down,
 *  filters, top/bottom/growth/decline. Scope-aware via the CP RPCs. */
export default async function CommercialPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.company?.id || !ctx.modules.includes('field_ops')) {
    return <div><PageHeader title={t('commercial.title')} /><Card><CardContent className="p-8 text-center text-muted-foreground">{t('commercial.noAccess')}</CardContent></Card></div>;
  }
  const sp = await searchParams;
  const month = firstOfMonth(sp.month);
  const group = sp.group ?? 'rep';
  const source = sp.source ?? null;
  const supabase = await createClient();
  const { data: settings } = await supabase.from('erp_cp_settings').select('actuals_source,rag_green,rag_amber').eq('company_id', ctx.company.id).maybeSingle();
  const green = Number(settings?.rag_green ?? 100), amber = Number(settings?.rag_amber ?? 90);
  const activeSource = source ?? (settings?.actuals_source === 'sales_orders' ? 'order' : 'invoice');

  let rows: Row[] = [];
  try {
    const { data } = await supabase.rpc('erp_cp_performance', {
      p_month: month, p_group_by: group, p_rep: sp.rep ?? null, p_route: sp.route ?? null, p_branch: sp.branch ?? null,
      p_region: sp.region ?? null, p_area: sp.area ?? null, p_channel: sp.channel ?? null, p_classification: sp.classification ?? null,
      p_category: sp.category ?? null, p_source: source,
    });
    rows = (data as Row[]) ?? [];
  } catch { /* scope/empty */ }

  // header KPIs reconcile to the visible breakdown
  const sum = (f: (b: Block) => number) => rows.reduce((s, r) => s + (f(r.value) || 0), 0);
  const sumQ = (f: (b: Block) => number) => rows.reduce((s, r) => s + (f(r.qty) || 0), 0);
  const vAct = sum((b) => b.actual), vTgt = sum((b) => b.target ?? 0), vPrior = sum((b) => b.prior), vYoy = sum((b) => b.yoy);
  const qAct = sumQ((b) => b.actual), qTgt = sumQ((b) => b.target ?? 0), qPrior = sumQ((b) => b.prior), qYoy = sumQ((b) => b.yoy);
  const pct = (a: number, b: number) => (b > 0 ? Math.round((100 * a) / b) : null);
  const growth = (a: number, b: number) => (b > 0 ? Math.round((1000 * (a - b)) / b) / 10 : null);
  const vAch = pct(vAct, vTgt), qAch = pct(qAct, qTgt);

  const qs = (patch: Partial<SP>) => {
    const m: SP = { ...sp, month, group, ...patch };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(m)) if (v) p.set(k, String(v));
    return `/commercial?${p.toString()}`;
  };
  const chip = (active: boolean) => `whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium ${active ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background text-muted-foreground'}`;
  const drillHref = (r: Row): string | null => {
    if (group in GEO_NEXT) { const d = GEO_NEXT[group]; return qs({ [d.param]: r.key, group: d.next } as Partial<SP>); }
    if (group === 'category') return qs({ category: r.key, group: 'sku' });
    return null;
  };
  // top / bottom / growth / decline from the current breakdown
  const withAch = rows.filter((r) => r.value.achievement != null);
  const top = [...withAch].sort((a, b) => (b.value.achievement! - a.value.achievement!)).slice(0, 5);
  const bottom = [...withAch].sort((a, b) => (a.value.achievement! - b.value.achievement!)).slice(0, 5);
  const withYoy = rows.filter((r) => r.value.yoy_growth != null);
  const grow = [...withYoy].sort((a, b) => b.value.yoy_growth! - a.value.yoy_growth!).slice(0, 5);
  const decline = [...withYoy].sort((a, b) => a.value.yoy_growth! - b.value.yoy_growth!).slice(0, 5);

  return (
    <div className="mx-auto max-w-3xl space-y-3 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageHeader title={t('commercial.title')} />
        <div className="flex items-center gap-3">
          <Link href="/commercial/targets" className="text-xs font-medium text-primary hover:underline">{t('commercial.targets')}</Link>
          <Link href="/commercial/promotions" className="text-xs font-medium text-primary hover:underline">{t('commercial.tpm.link')}</Link>
          <Link href="/commercial/statements" className="text-xs font-medium text-primary hover:underline">{t('commercial.statements')}</Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <MonthPicker month={month} />
        <Badge variant="secondary">{t('commercial.activeSource')}: {activeSource === 'order' ? t('commercial.sourceOrder') : activeSource === 'all' ? t('commercial.sourceAll') : t('commercial.sourceInvoice')}</Badge>
      </div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1">
        {['invoice', 'order', 'all'].map((sv) => <Link key={sv} href={qs({ source: sv })} className={chip(activeSource === sv)}>{t(`commercial.source${sv[0].toUpperCase()}${sv.slice(1)}` as 'commercial.sourceInvoice')}</Link>)}
      </div>

      {/* 10 KPI cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Kpi label={t('commercial.actualValue')} value={n2(vAct)} />
        <Kpi label={t('commercial.actualQty')} value={n2(qAct)} />
        <Kpi label={t('commercial.targetValue')} value={n2(vTgt)} />
        <Kpi label={t('commercial.targetQty')} value={n2(qTgt)} />
        <Kpi label={t('commercial.achValue')} value={vAch != null ? `${vAch}%` : '—'} ragDot={rag(vAch, green, amber)} />
        <Kpi label={t('commercial.achQty')} value={qAch != null ? `${qAch}%` : '—'} ragDot={rag(qAch, green, amber)} />
        <Kpi label={t('commercial.yoyValue')} value={fmtG(growth(vAct, vYoy))} />
        <Kpi label={t('commercial.yoyQty')} value={fmtG(growth(qAct, qYoy))} />
        <Kpi label={t('commercial.ppValue')} value={fmtG(growth(vAct, vPrior))} />
        <Kpi label={t('commercial.ppQty')} value={fmtG(growth(qAct, qPrior))} />
      </div>

      {/* group-by (geo · product · other) */}
      <div className="space-y-1">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1">
          {GEO.map((g) => <Link key={g} href={qs({ group: g })} className={chip(group === g)}>{t(`commercial.dims.${g}`)}</Link>)}
        </div>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1">
          {[...PROD, ...OTHER].map((g) => <Link key={g} href={qs({ group: g })} className={chip(group === g)}>{t(`commercial.dims.${g}`)}</Link>)}
        </div>
      </div>

      {/* performance breakdown */}
      {rows.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{t('commercial.empty')}</CardContent></Card>
      ) : (
        <Card><CardContent className="divide-y p-0">
          {rows.map((r) => {
            const href = drillHref(r);
            const body = (
              <div className="flex items-center gap-2 p-2.5 text-sm">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${ragColor[r.value.rag ?? ''] ?? 'bg-muted'}`} />
                <span className="min-w-0 flex-1 truncate font-medium">{r.label ?? r.key}</span>
                <span className="w-20 text-end tabular-nums">{n2(r.value.actual)}</span>
                <span className="w-12 text-end text-xs tabular-nums text-muted-foreground">{r.value.achievement != null ? `${r.value.achievement}%` : '—'}</span>
                <span className={`w-12 text-end text-xs tabular-nums ${growthTone(r.value.yoy_growth)}`}>{fmtG(r.value.yoy_growth)}</span>
              </div>
            );
            return href ? <Link key={r.key} href={href} className="block hover:bg-muted/50">{body}</Link> : <div key={r.key}>{body}</div>;
          })}
        </CardContent></Card>
      )}

      {/* performers */}
      <div className="grid gap-2 sm:grid-cols-2">
        <RankList title={t('commercial.topPerformers')} rows={top} kind="ach" />
        <RankList title={t('commercial.bottomPerformers')} rows={bottom} kind="ach" />
        <RankList title={t('commercial.largestGrowth')} rows={grow} kind="yoy" />
        <RankList title={t('commercial.largestDecline')} rows={decline} kind="yoy" />
      </div>
    </div>
  );
}

function Kpi({ label, value, ragDot }: { label: string; value: string; ragDot?: string | null }) {
  return <Card><CardContent className="p-2.5">
    <div className="flex items-center gap-1.5">{ragDot && <span className={`h-2 w-2 rounded-full ${({ green: 'bg-green-500', amber: 'bg-amber-500', red: 'bg-red-500' } as Record<string, string>)[ragDot]}`} />}<span className="text-lg font-semibold tabular-nums">{value}</span></div>
    <div className="text-[10px] text-muted-foreground">{label}</div>
  </CardContent></Card>;
}
function RankList({ title, rows, kind }: { title: string; rows: Row[]; kind: 'ach' | 'yoy' }) {
  return <Card><CardContent className="space-y-1 p-3">
    <div className="text-xs font-medium">{title}</div>
    {rows.length === 0 ? <div className="text-xs text-muted-foreground">—</div> : rows.map((r, i) => (
      <div key={r.key} className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate">{i + 1}. {r.label ?? r.key}</span>
        <span className={`tabular-nums ${kind === 'yoy' ? growthTone(r.value.yoy_growth) : ''}`}>{kind === 'ach' ? `${r.value.achievement}%` : fmtG(r.value.yoy_growth)}</span>
      </div>
    ))}
  </CardContent></Card>;
}
function fmtG(g: number | null | undefined) { return g == null ? '—' : `${g > 0 ? '+' : ''}${g}%`; }
function growthTone(g: number | null | undefined) { return g == null ? 'text-muted-foreground' : g > 0 ? 'text-green-600' : g < 0 ? 'text-red-600' : ''; }
