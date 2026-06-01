import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getT } from '@/lib/i18n/server';

const KINDS = ['supervisor', 'area', 'regional', 'executive'] as const;
type Kind = (typeof KINDS)[number];

/** FE-5e-4 — scope-aware management digest view (action-first, drill-through). */
export default async function DigestPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.company?.id || !ctx.modules.includes('field_ops')) {
    return <div><PageHeader title={t('field.digest.title')} /><Card><CardContent className="p-8 text-center text-muted-foreground">{t('field.digest.noAccess')}</CardContent></Card></div>;
  }
  const sp = await searchParams;
  const kind: Kind = KINDS.includes(sp.kind as Kind) ? (sp.kind as Kind) : 'supervisor';
  const supabase = await createClient();
  let d: Digest | null = null;
  try { d = ((await supabase.rpc('erp_fe_digest', { p_kind: kind })).data as Digest) ?? null; }
  catch { return <div><PageHeader title={t('field.digest.title')} /><Card><CardContent className="p-8 text-center text-muted-foreground">{t('field.digest.noAccess')}</CardContent></Card></div>; }

  const chip = (active: boolean) => `whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium ${active ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background text-muted-foreground'}`;

  return (
    <div className="mx-auto max-w-2xl space-y-3 pb-8">
      <BackLink href="/field/alerts" label={t('field.digest.back')} />
      <PageHeader title={t('field.digest.title')} />
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {KINDS.map((k) => <Link key={k} href={`/field/alerts/digest?kind=${k}`} className={chip(kind === k)}>{t(`field.digest.kind.${k}`)}</Link>)}
      </div>

      {!d ? <Card><CardContent className="p-8 text-center text-muted-foreground">{t('field.digest.noAccess')}</CardContent></Card> : (
        <>
          {/* alerts headline */}
          <div className="grid grid-cols-3 gap-2">
            <Kpi label={t('field.digest.openAlerts')} value={d.alerts.open} />
            <Kpi label={t('field.digest.newSince')} value={d.alerts.new_since} />
            <Kpi label={t('field.digest.overdue')} value={d.alerts.overdue} tone="text-amber-600" />
          </div>

          {/* per-pillar summaries */}
          <div className="grid grid-cols-2 gap-2">
            <Stat title={t('field.digest.coverage')} lines={[[t('field.digest.visited'), `${d.coverage.visited}/${d.coverage.planned}`], ['%', `${d.coverage.coverage_pct}%`]]} />
            <Stat title={t('field.digest.compliance')} lines={[[t('field.digest.violations'), String(d.compliance.violations)], ['%', `${d.compliance.violation_pct}%`]]} />
            <Stat title={t('field.digest.oos')} lines={[[t('field.digest.items'), String(d.oos.count)], [t('field.digest.customers'), String(d.oos.customers)]]} />
            <Stat title={t('field.digest.opportunity')} lines={[[t('field.digest.items'), String(d.opportunity.count)], [t('field.digest.highValue'), String(d.opportunity.high_value)]]} />
            <Stat title={t('field.digest.customerRisk')} lines={[[t('field.digest.atRisk'), String(d.customer_risk.at_risk_customers)]]} />
          </div>

          <RiskList title={t('field.digest.topRiskReps')} items={d.top_risk_reps} t={t} />
          <RiskList title={t('field.digest.topRiskRoutes')} items={d.top_risk_routes} t={t} />

          {d.performers && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Performers title={t('field.digest.positive')} items={d.performers.positive} empty={t('field.digest.none')} />
              <Performers title={t('field.digest.attention')} items={d.performers.attention} empty={t('field.digest.none')} />
            </div>
          )}

          {d.overdue_alerts.length > 0 && (
            <Section title={t('field.digest.overdueAlerts')}>
              {d.overdue_alerts.map((a) => <LinkRow key={a.id} href={a.href} label={a.title} right={a.due_date ?? ''} />)}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return <Card><CardContent className="p-2.5 text-center"><div className={`text-xl font-semibold tabular-nums ${tone ?? ''}`}>{value}</div><div className="text-[10px] text-muted-foreground">{label}</div></CardContent></Card>;
}
function Stat({ title, lines }: { title: string; lines: [string, string][] }) {
  return <Card><CardContent className="p-3"><div className="mb-1 text-xs font-medium">{title}</div>{lines.map(([k, v]) => <div key={k} className="flex justify-between text-xs text-muted-foreground"><span>{k}</span><span className="tabular-nums text-foreground">{v}</span></div>)}</CardContent></Card>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <Card><CardContent className="space-y-1 p-3"><div className="text-xs font-medium">{title}</div>{children}</CardContent></Card>;
}
function LinkRow({ href, label, right }: { href: string | null; label: string; right?: string }) {
  const inner = <div className="flex items-center justify-between gap-2 py-1 text-sm"><span className="truncate">{label}</span>{right && <span className="shrink-0 text-xs text-muted-foreground">{right}</span>}</div>;
  return href ? <Link href={href} className="block hover:text-primary">{inner}</Link> : inner;
}
function RiskList({ title, items, t }: { title: string; items: RiskItem[]; t: (k: string) => string }) {
  if (!items?.length) return null;
  return <Section title={title}>{items.map((it, i) => (
    <LinkRow key={i} href={it.href} label={it.name ?? '—'} right={`${it.alerts} · ${it.critical} ${t('field.alerts.critical')}`} />
  ))}</Section>;
}
function Performers({ title, items, empty }: { title: string; items: Perf[]; empty: string }) {
  return <Card><CardContent className="space-y-1 p-3"><div className="text-xs font-medium">{title}</div>
    {items.length === 0 ? <div className="text-xs text-muted-foreground">{empty}</div> :
      items.map((p, i) => <LinkRow key={i} href={p.href} label={`${i + 1}. ${p.name ?? '—'}`} right={String(Math.round(p.overall))} />)}
  </CardContent></Card>;
}

type RiskItem = { route_id?: string; rep_id?: string; name: string | null; alerts: number; critical: number; href: string | null };
type Perf = { rep_id: string; name: string | null; overall: number; href: string | null };
interface Digest {
  kind: string; generated_at: string;
  alerts: { open: number; critical: number; warning: number; info: number; unowned: number; overdue: number; new_since: number };
  new_alerts: { id: string; title: string; severity: string; href: string | null }[];
  overdue_alerts: { id: string; title: string; due_date: string | null; href: string | null }[];
  top_risk_routes: RiskItem[]; top_risk_reps: RiskItem[];
  coverage: { planned: number; visited: number; coverage_pct: number; compliance_pct: number };
  compliance: { visits: number; violations: number; ok: number; violation_pct: number };
  oos: { count: number; est_lost_sales: number; customers: number };
  opportunity: { count: number; value: number; high_value: number };
  customer_risk: { at_risk_customers: number; alerts: number };
  performers?: { positive: Perf[]; attention: Perf[] };
}
