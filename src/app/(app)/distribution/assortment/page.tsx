import { redirect } from 'next/navigation';
import { PackageCheck, Layers, AlertTriangle, Trophy } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard, type StatTone } from '@/components/shared/stat-card';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  weightedOutletCompliance, summarizeCompliance, complianceBand,
  type WeightedOutletCompliance,
} from '@/lib/erp/assortment';
import {
  resolveMslForOutlet, type MslPolicy, type Lookup, type MslLevel, type Outlet,
} from '@/lib/erp/msl-matrix';
import { distributionForProducts, summarizeDistribution, type OutletForKpi } from '@/lib/erp/distribution-kpi';
import { perfectStoreScore, perfectStoreBand } from '@/lib/erp/perfect-store';

async function safe<T>(fn: () => Promise<T>, fb: T): Promise<T> { try { return await fn(); } catch { return fb; } }

const BAND_TONE: Record<'good' | 'attention' | 'critical', StatTone> = { good: 'success', attention: 'warning', critical: 'destructive' };
const WINDOW_DAYS = 90;
const MAX_OUTLETS = 300;

type Row = Record<string, unknown>;

export default async function AssortmentPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'reports.view')) redirect('/dashboard');

  const { t, locale } = await getT();
  const supabase = await createClient();
  const sinceIso = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
  const today = new Date().toISOString();

  // ── Load the dynamic MSL matrix + outlet universe (all defensive) ──
  const [policiesR, conditionsR, itemsR, levelsR, lookupsR, customersR, attrsR, invoicesR] = await Promise.all([
    safe(async () => (await supabase.from('erp_msl_policies').select('id, priority, effective_from, effective_to, is_active').eq('is_active', true)).data ?? [], [] as Row[]),
    safe(async () => (await supabase.from('erp_msl_policy_conditions').select('policy_id, lookup_id')).data ?? [], [] as Row[]),
    safe(async () => (await supabase.from('erp_msl_policy_items').select('policy_id, product_id, level_id, weight, is_active')).data ?? [], [] as Row[]),
    safe(async () => (await supabase.from('erp_msl_levels').select('id, weight')).data ?? [], [] as Row[]),
    safe(async () => (await supabase.from('erp_customer_lookups').select('id, kind')).data ?? [], [] as Row[]),
    safe(async () => (await supabase.from('erp_customers').select('id, name, name_ar, segment_id, classification_id, channel_id').eq('is_active', true).limit(MAX_OUTLETS)).data ?? [], [] as Row[]),
    safe(async () => (await supabase.from('erp_customer_attributes').select('customer_id, lookup_id')).data ?? [], [] as Row[]),
    safe(async () => (await supabase.from('erp_invoices').select('id, customer_id, net_amount').gte('created_at', sinceIso).limit(20000)).data ?? [], [] as Row[]),
  ]);

  // Sold products + commercial weight per outlet (from recent invoices + lines).
  const invoiceIds = invoicesR.map((r) => String(r.id));
  const linesR = invoiceIds.length > 0
    ? await safe(async () => (await supabase.from('erp_invoice_lines').select('invoice_id, product_id').in('invoice_id', invoiceIds.slice(0, 20000))).data ?? [], [] as Row[])
    : [];
  const custByInvoice = new Map(invoicesR.map((r) => [String(r.id), String(r.customer_id)]));
  const soldByCustomer = new Map<string, Set<string>>();
  for (const l of linesR) {
    const cust = custByInvoice.get(String(l.invoice_id)); if (!cust) continue;
    (soldByCustomer.get(cust) ?? soldByCustomer.set(cust, new Set()).get(cust)!).add(String(l.product_id));
  }
  const valueByCustomer = new Map<string, number>();
  for (const r of invoicesR) {
    const c = String(r.customer_id);
    valueByCustomer.set(c, (valueByCustomer.get(c) ?? 0) + Math.max(0, Number(r.net_amount) || 0));
  }

  // Latest survey score per customer (Perfect Store survey pillar).
  const responsesR = await safe(async () => (await supabase.from('erp_survey_responses').select('customer_id, score, created_at').order('created_at', { ascending: false }).limit(5000)).data ?? [], [] as Row[]);
  const surveyScoreByCustomer = new Map<string, number>();
  for (const r of responsesR) {
    const c = String(r.customer_id);
    if (!surveyScoreByCustomer.has(c) && r.score != null) surveyScoreByCustomer.set(c, Number(r.score));
  }

  // ── Build engine inputs ──
  const lookups: Lookup[] = lookupsR.map((r) => ({ id: String(r.id), kind: String(r.kind) }));
  const levels: MslLevel[] = levelsR.map((r) => ({ id: String(r.id), weight: Number(r.weight) || 1 }));
  const condByPolicy = new Map<string, string[]>();
  for (const c of conditionsR) (condByPolicy.get(String(c.policy_id)) ?? condByPolicy.set(String(c.policy_id), []).get(String(c.policy_id))!).push(String(c.lookup_id));
  const itemsByPolicy = new Map<string, MslPolicy['items']>();
  for (const i of itemsR) (itemsByPolicy.get(String(i.policy_id)) ?? itemsByPolicy.set(String(i.policy_id), []).get(String(i.policy_id))!).push({ productId: String(i.product_id), levelId: i.level_id ? String(i.level_id) : null, weight: i.weight == null ? null : Number(i.weight), isActive: i.is_active !== false });
  const policies: MslPolicy[] = policiesR.map((r) => ({
    id: String(r.id), priority: Number(r.priority) || 0, isActive: r.is_active !== false,
    effectiveFrom: r.effective_from ? String(r.effective_from) : null, effectiveTo: r.effective_to ? String(r.effective_to) : null,
    conditionLookupIds: condByPolicy.get(String(r.id)) ?? [], items: itemsByPolicy.get(String(r.id)) ?? [],
  }));
  const attrsByCustomer = new Map<string, string[]>();
  for (const a of attrsR) (attrsByCustomer.get(String(a.customer_id)) ?? attrsByCustomer.set(String(a.customer_id), []).get(String(a.customer_id))!).push(String(a.lookup_id));

  const productUniverse = new Set<string>();
  for (const p of policies) for (const it of p.items) productUniverse.add(it.productId);

  // ── Per-outlet compliance + Perfect Store ──
  const compliance: WeightedOutletCompliance[] = [];
  const kpiOutlets: OutletForKpi[] = [];
  const psScores: number[] = [];
  const nameByCustomer = new Map<string, string>();
  for (const c of customersR) {
    const id = String(c.id);
    nameByCustomer.set(id, (locale === 'ar' && c.name_ar ? String(c.name_ar) : String(c.name)) || id.slice(0, 6));
    const lookupIds = [c.segment_id, c.classification_id, c.channel_id].filter(Boolean).map(String).concat(attrsByCustomer.get(id) ?? []);
    const outlet: Outlet = { customerId: id, lookupIds };
    const resolved = resolveMslForOutlet(policies, outlet, lookups, levels, today);
    const reqWeights = new Map([...resolved].map(([pid, r]) => [pid, r.weight]));
    const sold = soldByCustomer.get(id) ?? new Set<string>();
    const comp = weightedOutletCompliance(id, reqWeights, sold);
    if (comp.required > 0) compliance.push(comp);
    kpiOutlets.push({ customerId: id, weight: valueByCustomer.get(id) || 1, soldProductIds: sold });
    const ps = perfectStoreScore({
      mslCompliancePct: comp.required > 0 ? comp.weightedPct : null,
      surveyScorePct: surveyScoreByCustomer.has(id) ? surveyScoreByCustomer.get(id)! : null,
    });
    if (ps.hasData) psScores.push(ps.score);
  }

  const summary = summarizeCompliance(compliance);
  const distRows = distributionForProducts([...productUniverse], kpiOutlets);
  const distSummary = summarizeDistribution(distRows);
  const overallPs = psScores.length > 0 ? Math.round(psScores.reduce((a, b) => a + b, 0) / psScores.length) : 0;
  const psBand = perfectStoreBand(overallPs, psScores.length > 0);

  const worstOutlets = [...compliance].sort((a, b) => a.weightedPct - b.weightedPct).slice(0, 10);
  const worstSkus = distRows.slice(0, 10);
  const hasData = compliance.length > 0 || productUniverse.size > 0;

  const productLabel = new Map<string, string>(); // filled lazily for worst SKUs
  if (worstSkus.length > 0) {
    const ids = worstSkus.map((s) => s.productId);
    const prodR = await safe(async () => (await supabase.from('erp_products_catalog').select('id, code, name').in('id', ids)).data ?? [], [] as Row[]);
    for (const p of prodR) productLabel.set(String(p.id), `${p.code ? p.code + ' · ' : ''}${String(p.name)}`);
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('retail.assort.title')} description={t('retail.assort.subtitle')} />

      {!hasData ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('retail.assort.empty')}</CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label={t('retail.assort.compliance')} value={`${summary.compliancePct}%`} icon={PackageCheck} tone={BAND_TONE[complianceBand(summary.compliancePct)]} hint={`${summary.fullyCompliantOutlets}/${summary.outlets} ${t('retail.assort.fullyCompliant')}`} />
            <StatCard label={t('retail.assort.gapLines')} value={String(summary.gapLines)} icon={AlertTriangle} tone={summary.gapLines > 0 ? 'warning' : 'success'} />
            <StatCard label={t('retail.assort.numericDist')} value={`${distSummary.avgNumericPct}%`} icon={Layers} tone="info" hint={`${t('retail.assort.weightedDist')} ${distSummary.avgWeightedPct}%`} />
            <StatCard label={t('retail.assort.perfectStore')} value={`${overallPs}%`} icon={Trophy} tone={psBand === 'gold' ? 'success' : psBand === 'silver' ? 'info' : psBand === 'bronze' ? 'warning' : 'destructive'} hint={t(`retail.assort.psband.${psBand}`)} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="space-y-3">
              <h2 className="text-sm font-semibold">{t('retail.assort.worstOutlets')}</h2>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-start font-medium">{t('retail.assort.outlet')}</th>
                      <th className="px-3 py-2 text-end font-medium">{t('retail.assort.compliance')}</th>
                      <th className="px-3 py-2 text-end font-medium">{t('retail.assort.gap')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {worstOutlets.map((o) => (
                      <tr key={o.customerId} className="border-t">
                        <td className="px-3 py-2">{nameByCustomer.get(o.customerId)}</td>
                        <td className="px-3 py-2 text-end">
                          <Badge variant={complianceBand(o.weightedPct) === 'good' ? 'success' : complianceBand(o.weightedPct) === 'attention' ? 'warning' : 'destructive'}>{o.weightedPct}%</Badge>
                        </td>
                        <td className="px-3 py-2 text-end tabular-nums">{o.missing}/{o.required}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold">{t('retail.assort.worstSkus')}</h2>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-start font-medium">{t('retail.assort.sku')}</th>
                      <th className="px-3 py-2 text-end font-medium">{t('retail.assort.numericDist')}</th>
                      <th className="px-3 py-2 text-end font-medium">{t('retail.assort.weightedDist')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {worstSkus.map((s) => (
                      <tr key={s.productId} className="border-t">
                        <td className="px-3 py-2">{productLabel.get(s.productId) ?? s.productId.slice(0, 6)}</td>
                        <td className="px-3 py-2 text-end tabular-nums">{s.numericPct}%</td>
                        <td className="px-3 py-2 text-end tabular-nums">{s.weightedPct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
