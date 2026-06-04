/** ── Executive Retail Execution — shared server data builder ────────────────
 *
 *  ONE assembly that every retail-execution dashboard (MSL Compliance,
 *  Distribution, OOS, Perfect Store, Cockpit) and the Assortment page consume —
 *  so the heavy per-outlet computation exists once (no duplicate functionality).
 *  Resolves each outlet's dynamic MSL, tags it with every dynamic dimension
 *  (region/area/supervisor/salesman/customer + company lookup kinds), and attaches
 *  sold/availability/survey signals. RLS-scoped (the caller passes the client);
 *  every query is defensive so it degrades to a clean empty state on drift.
 */

import { resolveMslForOutlet, type MslPolicy, type Lookup, type MslLevel, type Outlet } from './msl-matrix';
import { weightedOutletCompliance } from './assortment';
import type { OutletMetric } from './retail-rollup';

type Row = Record<string, unknown>;
type DB = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function safe<T>(fn: () => Promise<T>, fb: T): Promise<T> { try { return await fn(); } catch { return fb; } }
const s = (v: unknown) => (v == null ? '' : String(v));

export interface RetailExecData {
  ready: boolean;
  metrics: OutletMetric[];
  soldByCustomer: Map<string, Set<string>>;
  valueByCustomer: Map<string, number>;
  productUniverse: string[];
  productLabel: Map<string, string>;
  brandOf: Map<string, string>;
  /** Dynamic outlet-axis dimension keys present (region/area/…/channel/…). */
  outletDimensions: string[];
}

const WINDOW_DAYS = 90;
const MAX_OUTLETS = 500;

export async function loadRetailExecData(
  supabase: DB,
  opts: { locale: 'ar' | 'en' } = { locale: 'en' },
): Promise<RetailExecData> {
  const sinceIso = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
  const today = new Date().toISOString();
  const arName = (r: Row, en = 'name', ar = 'name_ar') => (opts.locale === 'ar' && r[ar] ? s(r[ar]) : s(r[en]));

  const [policiesR, conditionsR, itemsR, levelsR, lookupsR, customersR, attrsR, invoicesR, regionsR, areasR, profilesR] = await Promise.all([
    safe<Row[]>(async () => (await supabase.from('erp_msl_policies').select('id, priority, effective_from, effective_to, is_active').eq('is_active', true)).data ?? [], [] as Row[]),
    safe<Row[]>(async () => (await supabase.from('erp_msl_policy_conditions').select('policy_id, lookup_id')).data ?? [], [] as Row[]),
    safe<Row[]>(async () => (await supabase.from('erp_msl_policy_items').select('policy_id, product_id, level_id, weight, is_active')).data ?? [], [] as Row[]),
    safe<Row[]>(async () => (await supabase.from('erp_msl_levels').select('id, weight')).data ?? [], [] as Row[]),
    safe<Row[]>(async () => (await supabase.from('erp_customer_lookups').select('id, kind, name, name_ar')).data ?? [], [] as Row[]),
    safe<Row[]>(async () => (await supabase.from('erp_customers').select('id, name, name_ar, region_id, area_id, salesman_id, segment_id, classification_id, channel_id').eq('is_active', true).limit(MAX_OUTLETS)).data ?? [], [] as Row[]),
    safe<Row[]>(async () => (await supabase.from('erp_customer_attributes').select('customer_id, lookup_id')).data ?? [], [] as Row[]),
    safe<Row[]>(async () => (await supabase.from('erp_invoices').select('id, customer_id, net_amount').gte('created_at', sinceIso).limit(20000)).data ?? [], [] as Row[]),
    safe<Row[]>(async () => (await supabase.from('erp_regions').select('id, name, name_ar')).data ?? [], [] as Row[]),
    safe<Row[]>(async () => (await supabase.from('erp_areas').select('id, name, name_ar')).data ?? [], [] as Row[]),
    safe<Row[]>(async () => (await supabase.from('erp_profiles').select('id, full_name')).data ?? [], [] as Row[]),
  ]);

  // Best-effort salesman → supervisor hierarchy (isolated so a missing column
  // never breaks names). reports_to references a profile id.
  const hierR = await safe<Row[]>(async () => (await supabase.from('erp_profiles').select('id, reports_to')).data ?? [], [] as Row[]);

  // Sold products + commercial value per outlet.
  const invoiceIds = invoicesR.map((r) => s(r.id));
  const linesR = invoiceIds.length > 0
    ? await safe<Row[]>(async () => (await supabase.from('erp_invoice_lines').select('invoice_id, product_id').in('invoice_id', invoiceIds.slice(0, 20000))).data ?? [], [] as Row[])
    : [];
  const custByInvoice = new Map(invoicesR.map((r) => [s(r.id), s(r.customer_id)]));
  const soldByCustomer = new Map<string, Set<string>>();
  for (const l of linesR) {
    const c = custByInvoice.get(s(l.invoice_id)); if (!c) continue;
    (soldByCustomer.get(c) ?? soldByCustomer.set(c, new Set()).get(c)!).add(s(l.product_id));
  }
  const valueByCustomer = new Map<string, number>();
  for (const r of invoicesR) { const c = s(r.customer_id); valueByCustomer.set(c, (valueByCustomer.get(c) ?? 0) + Math.max(0, Number(r.net_amount) || 0)); }

  // Latest survey score per customer.
  const responsesR = await safe<Row[]>(async () => (await supabase.from('erp_survey_responses').select('customer_id, score, created_at').order('created_at', { ascending: false }).limit(5000)).data ?? [], [] as Row[]);
  const surveyByCustomer = new Map<string, number>();
  for (const r of responsesR) { const c = s(r.customer_id); if (!surveyByCustomer.has(c) && r.score != null) surveyByCustomer.set(c, Number(r.score)); }

  // ── Build the dynamic MSL matrix ──
  const lookups: Lookup[] = lookupsR.map((r) => ({ id: s(r.id), kind: s(r.kind) }));
  const lookupMeta = new Map(lookupsR.map((r) => [s(r.id), { kind: s(r.kind), label: arName(r) }]));
  const levels: MslLevel[] = levelsR.map((r) => ({ id: s(r.id), weight: Number(r.weight) || 1 }));
  const condByPolicy = new Map<string, string[]>();
  for (const c of conditionsR) (condByPolicy.get(s(c.policy_id)) ?? condByPolicy.set(s(c.policy_id), []).get(s(c.policy_id))!).push(s(c.lookup_id));
  const itemsByPolicy = new Map<string, MslPolicy['items']>();
  for (const i of itemsR) (itemsByPolicy.get(s(i.policy_id)) ?? itemsByPolicy.set(s(i.policy_id), []).get(s(i.policy_id))!).push({ productId: s(i.product_id), levelId: i.level_id ? s(i.level_id) : null, weight: i.weight == null ? null : Number(i.weight), isActive: i.is_active !== false });
  const policies: MslPolicy[] = policiesR.map((r) => ({
    id: s(r.id), priority: Number(r.priority) || 0, isActive: r.is_active !== false,
    effectiveFrom: r.effective_from ? s(r.effective_from) : null, effectiveTo: r.effective_to ? s(r.effective_to) : null,
    conditionLookupIds: condByPolicy.get(s(r.id)) ?? [], items: itemsByPolicy.get(s(r.id)) ?? [],
  }));

  const attrsByCustomer = new Map<string, string[]>();
  for (const a of attrsR) (attrsByCustomer.get(s(a.customer_id)) ?? attrsByCustomer.set(s(a.customer_id), []).get(s(a.customer_id))!).push(s(a.lookup_id));
  const regionLabel = new Map(regionsR.map((r) => [s(r.id), arName(r)]));
  const areaLabel = new Map(areasR.map((r) => [s(r.id), arName(r)]));
  const profileName = new Map(profilesR.map((r) => [s(r.id), s(r.full_name)]));
  const supervisorOf = new Map(hierR.map((r) => [s(r.id), s(r.reports_to)]));

  const productUniverse = new Set<string>();
  for (const p of policies) for (const it of p.items) productUniverse.add(it.productId);

  // ── Per-outlet metrics ──
  const dimKeys = new Set<string>();
  const metrics: OutletMetric[] = customersR.map((c) => {
    const id = s(c.id);
    const name = arName(c) || id.slice(0, 6);
    const dims: OutletMetric['dims'] = {};
    if (c.region_id) { dims.region = { id: s(c.region_id), label: regionLabel.get(s(c.region_id)) ?? '—' }; dimKeys.add('region'); }
    if (c.area_id) { dims.area = { id: s(c.area_id), label: areaLabel.get(s(c.area_id)) ?? '—' }; dimKeys.add('area'); }
    if (c.salesman_id) {
      const sid = s(c.salesman_id);
      dims.salesman = { id: sid, label: profileName.get(sid) ?? '—' }; dimKeys.add('salesman');
      const supId = supervisorOf.get(sid);
      if (supId) { dims.supervisor = { id: supId, label: profileName.get(supId) ?? '—' }; dimKeys.add('supervisor'); }
    }
    dims.customer = { id, label: name }; dimKeys.add('customer');
    const lookupIds = [c.segment_id, c.classification_id, c.channel_id].filter(Boolean).map(s).concat(attrsByCustomer.get(id) ?? []);
    for (const lid of lookupIds) {
      const meta = lookupMeta.get(lid); if (!meta) continue;
      dims[meta.kind] = { id: lid, label: meta.label }; dimKeys.add(meta.kind);
    }

    const outlet: Outlet = { customerId: id, lookupIds };
    const resolved = resolveMslForOutlet(policies, outlet, lookups, levels, today);
    const reqWeights = new Map([...resolved].map(([pid, r]) => [pid, r.weight]));
    const sold = soldByCustomer.get(id) ?? new Set<string>();
    const comp = weightedOutletCompliance(id, reqWeights, sold);
    return {
      customerId: id, name, dims,
      required: comp.required, present: comp.present, gap: comp.missing,
      weightRequired: [...reqWeights.values()].reduce((a, b) => a + b, 0),
      weightPresent: [...reqWeights.entries()].reduce((a, [pid, w]) => a + (sold.has(pid) ? w : 0), 0),
      missingProductIds: comp.missingProductIds,
      requiredProductIds: [...reqWeights.keys()],
      soldCount: sold.size,
      value: valueByCustomer.get(id) || 0,
      surveyScorePct: surveyByCustomer.has(id) ? surveyByCustomer.get(id)! : null,
      hasMsl: comp.required > 0,
    };
  });

  // Product labels + brand for SKU/brand axes.
  const productLabel = new Map<string, string>();
  const brandOf = new Map<string, string>();
  if (productUniverse.size > 0) {
    const prodR = await safe<Row[]>(async () => (await supabase.from('erp_products_catalog').select('id, code, name, brand').in('id', [...productUniverse])).data ?? [], [] as Row[]);
    for (const p of prodR) {
      productLabel.set(s(p.id), `${p.code ? s(p.code) + ' · ' : ''}${s(p.name)}`);
      if (p.brand) brandOf.set(s(p.id), s(p.brand));
    }
  }

  const ready = policies.length > 0 || metrics.some((m) => m.hasMsl);
  // Stable dimension order: people/geo first, then dynamic lookup kinds.
  const fixedOrder = ['region', 'area', 'supervisor', 'salesman', 'customer'];
  const outletDimensions = [
    ...fixedOrder.filter((k) => dimKeys.has(k)),
    ...[...dimKeys].filter((k) => !fixedOrder.includes(k)).sort(),
  ];

  return { ready, metrics, soldByCustomer, valueByCustomer, productUniverse: [...productUniverse], productLabel, brandOf, outletDimensions };
}
