import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadFulfillment, serviceLevel, type FulfillmentRow, type ServiceLevel } from './reports';

// ============================================================================
// Van Sales — load reporting (server loader). Joins the loop (request → manifest
// → confirmation) and feeds the PURE reporting core (reports.ts). RLS scopes the
// reads to the caller's company. Read-only.
// ============================================================================

export interface VanReportRow {
  confirmationId: string;
  manifestNumber: string | null;
  status: string;
  rows: FulfillmentRow[];
  service: ServiceLevel;
}

export interface VanReports {
  overall: ServiceLevel;
  reports: VanReportRow[];
}

function group<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = m.get(k);
    if (list) list.push(r); else m.set(k, [r]);
  }
  return m;
}

/** Recent load confirmations with their requested-vs-approved-vs-received
 *  fulfillment + per-report and overall service level. */
export async function loadVanReports(supabase: SupabaseClient, limit = 20): Promise<VanReports> {
  const { data: confs } = await supabase
    .from('erp_van_load_confirmations')
    .select('id, manifest_id, status')
    .order('created_at', { ascending: false })
    .limit(limit);
  const confRows = (confs ?? []) as { id: string; manifest_id: string; status: string }[];
  if (confRows.length === 0) return { overall: serviceLevel([]), reports: [] };

  const confIds = confRows.map((c) => c.id);
  const manIds = [...new Set(confRows.map((c) => c.manifest_id))];

  const [{ data: confLines }, { data: mans }] = await Promise.all([
    supabase.from('erp_van_load_confirmation_lines').select('confirmation_id, product_id, loaded_qty, accepted_qty').in('confirmation_id', confIds),
    supabase.from('erp_van_load_manifests').select('id, manifest_number, stock_request_id').in('id', manIds),
  ]);
  const cl = (confLines ?? []) as { confirmation_id: string; product_id: string; loaded_qty: number; accepted_qty: number }[];
  const manById = new Map((mans ?? []).map((m) => [(m as { id: string }).id, m as { manifest_number: string | null; stock_request_id: string | null }]));

  const reqIds = [...new Set((mans ?? []).map((m) => (m as { stock_request_id: string | null }).stock_request_id).filter(Boolean))] as string[];
  const { data: reqLines } = reqIds.length
    ? await supabase.from('erp_stock_request_lines').select('request_id, product_id, quantity, approved_qty').in('request_id', reqIds)
    : { data: [] };
  const rl = (reqLines ?? []) as { request_id: string; product_id: string; quantity: number; approved_qty: number | null }[];

  const clByConf = group(cl, (l) => l.confirmation_id);
  const rlByReq = group(rl, (l) => l.request_id);

  const reports: VanReportRow[] = [];
  const allRows: FulfillmentRow[] = [];
  for (const c of confRows) {
    const man = manById.get(c.manifest_id);
    const received = (clByConf.get(c.id) ?? []).map((l) => ({ productId: l.product_id, loaded: Number(l.loaded_qty), accepted: Number(l.accepted_qty) }));
    const reqL = man?.stock_request_id ? rlByReq.get(man.stock_request_id) ?? [] : [];
    const requested = reqL.length
      ? reqL.map((l) => ({ productId: l.product_id, requested: Number(l.quantity), approved: l.approved_qty == null ? null : Number(l.approved_qty) }))
      : received.map((r) => ({ productId: r.productId, requested: r.loaded, approved: r.loaded })); // direct load → loaded is the baseline
    const rows = loadFulfillment(requested, received);
    allRows.push(...rows);
    reports.push({ confirmationId: c.id, manifestNumber: man?.manifest_number ?? null, status: c.status, rows, service: serviceLevel(rows) });
  }
  return { overall: serviceLevel(allRows), reports };
}
