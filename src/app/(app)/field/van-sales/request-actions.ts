'use server';

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { recordEvent } from '@/lib/workflow/emit';
import { logAudit } from '@/lib/erp/audit';
import { VAN_SALES_ENABLED, diffRequestLines, type RequestLineChange } from '@/lib/van-sales';

/** ── Van Sales (Phase B) — submit a van load (stock) request ────────────────
 *  Creates the request + lines on the EXISTING erp_stock_requests entity (origin
 *  'salesman'), then emits 'van_stock_request.submitted' so the CONFIGURABLE
 *  approval chain (0248 global default; per-company override via the Workflow
 *  Builder) starts: supervisor approval → mark approved → notify. The approval
 *  only flips the status; stock posts later, ONLY on load confirmation (0247).
 *  Flag-gated; field.sales. */

export interface StockRequestLineInput {
  productId: string;
  quantity: number;
}

export interface SubmitStockRequestInput {
  fromWarehouseId: string;
  toWarehouseId: string; // the van
  urgent?: boolean;
  notes?: string;
  /** Requested loading/delivery date (YYYY-MM-DD). The warehouse may adjust it. */
  requestedDate?: string;
  lines: StockRequestLineInput[];
}

export interface SubmitStockRequestResult {
  ok: boolean;
  error?: string;
  id?: string;
}

export async function submitStockRequest(input: SubmitStockRequestInput): Promise<SubmitStockRequestResult> {
  if (!VAN_SALES_ENABLED()) return { ok: false, error: 'disabled' };

  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: 'unauthorized' };
  if (!ctx.companyId) return { ok: false, error: 'no company' };
  if (!hasPermission(ctx, 'field.sales') && !ctx.isSuperAdmin) return { ok: false, error: 'unauthorized' };
  if (!input.fromWarehouseId || !input.toWarehouseId) return { ok: false, error: 'missing warehouse' };
  const lines = (input.lines ?? []).filter((l) => l.quantity > 0);
  if (lines.length === 0) return { ok: false, error: 'no lines' };

  const supabase = await createClient();

  // The request is branch-scoped — derive the branch from the van (destination).
  const { data: wh } = await supabase.from('erp_warehouses').select('branch_id').eq('id', input.toWarehouseId).maybeSingle();
  const branchId = (wh as { branch_id: string } | null)?.branch_id;
  if (!branchId) return { ok: false, error: 'warehouse not found' };

  // BL-5: canonical, atomic, branch-scoped number (was Date.now()+random with no
  // unique constraint — silent duplicates under concurrent/offline reps).
  const { data: requestNumber, error: numErr } = await supabase.rpc('erp_next_number', {
    p_branch_id: branchId, p_seq_type: 'stock_request',
  });
  if (numErr || !requestNumber) return { ok: false, error: numErr?.message ?? 'numbering failed' };
  const { data: req, error } = await supabase
    .from('erp_stock_requests')
    .insert({
      request_number: requestNumber as string,
      branch_id: branchId,
      from_warehouse_id: input.fromWarehouseId,
      to_warehouse_id: input.toWarehouseId,
      status: 'pending',
      origin: 'salesman',
      notes: input.notes ?? null,
      requested_by: ctx.userId,
      requested_date: input.requestedDate || null,
      approved_date: input.requestedDate || null,
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };
  const id = (req as { id: string }).id;

  const { error: lErr } = await supabase
    .from('erp_stock_request_lines')
    .insert(lines.map((l) => ({ request_id: id, product_id: l.productId, quantity: l.quantity })));
  if (lErr) return { ok: false, error: lErr.message, id };

  // Start the configurable approval chain (offline-safe; non-fatal).
  await recordEvent({
    eventType: 'van_stock_request.submitted',
    entity: 'van_stock_request',
    recordId: id,
    branchId,
    payload: { from_warehouse_id: input.fromWarehouseId, to_warehouse_id: input.toWarehouseId, urgent: input.urgent ?? false, line_count: lines.length },
  });
  await logAudit(supabase, {
    action: 'create',
    entity: 'van_stock_request',
    entityId: id,
    details: { origin: 'salesman', urgent: input.urgent ?? false, lines: lines.length },
    companyId: ctx.companyId,
  });
  return { ok: true, id };
}

/** ── Van Sales (Phase B) — supervisor adjustment of a load request ──────────
 *  Controlled supervisor authority to set the approved quantity per line (add /
 *  remove / increase / reduce) BEFORE the request is approved. Every quantity
 *  change is captured with a full before/after audit (requested → approved, who,
 *  why). A reason is REQUIRED whenever any quantity changes. stock.adjust gated. */

export interface AdjustLineInput {
  productId: string;
  approvedQty: number;
}

export interface AdjustStockRequestInput {
  requestId: string;
  lines: AdjustLineInput[];
  reason: string;
}

export interface AdjustStockRequestResult {
  ok: boolean;
  error?: string;
  changes?: RequestLineChange[];
}

export async function adjustStockRequest(input: AdjustStockRequestInput): Promise<AdjustStockRequestResult> {
  if (!VAN_SALES_ENABLED()) return { ok: false, error: 'disabled' };

  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: 'unauthorized' };
  if (!ctx.companyId) return { ok: false, error: 'no company' };
  if (!hasPermission(ctx, 'stock.adjust') && !ctx.isSuperAdmin) return { ok: false, error: 'unauthorized' };
  if (!input.requestId) return { ok: false, error: 'missing request' };
  if (!input.lines?.length) return { ok: false, error: 'no lines' };

  const supabase = await createClient();
  const { data: existing, error: exErr } = await supabase
    .from('erp_stock_request_lines')
    .select('id, product_id, quantity, approved_qty')
    .eq('request_id', input.requestId);
  if (exErr) return { ok: false, error: exErr.message };

  type Row = { id: string; product_id: string; quantity: number; approved_qty: number | null };
  const byProduct = new Map((existing as Row[]).map((l) => [l.product_id, l]));

  // Compute before/after for the touched products (before = current approved, else
  // the requested qty; a brand-new product's before is 0 → shows as an "add").
  const before: { productId: string; quantity: number }[] = [];
  const after: { productId: string; quantity: number }[] = [];
  for (const adj of input.lines) {
    const cur = byProduct.get(adj.productId);
    before.push({ productId: adj.productId, quantity: cur ? Number(cur.approved_qty ?? cur.quantity) : 0 });
    after.push({ productId: adj.productId, quantity: adj.approvedQty });
  }
  const changes = diffRequestLines(before, after);
  if (changes.length === 0) return { ok: true, changes: [] }; // nothing changed
  if (!input.reason?.trim()) return { ok: false, error: 'reason_required' };

  // Apply: update approved_qty on existing lines; insert a 0-requested line for an
  // added product. (Removal = approved_qty 0 — the requested line is kept for audit.)
  for (const adj of input.lines) {
    const cur = byProduct.get(adj.productId);
    if (cur) {
      const { error } = await supabase.from('erp_stock_request_lines').update({ approved_qty: adj.approvedQty }).eq('id', cur.id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase.from('erp_stock_request_lines').insert({ request_id: input.requestId, product_id: adj.productId, quantity: 0, approved_qty: adj.approvedQty });
      if (error) return { ok: false, error: error.message };
    }
  }

  // Full before/after audit: requested_qty, previous + new approved_qty per line,
  // the diff, the reason, and who. (actor + company_id + timestamp are stamped on
  // the erp_audit_logs row by logAudit.)
  const auditLines = input.lines.map((adj) => {
    const cur = byProduct.get(adj.productId);
    return {
      product_id: adj.productId,
      requested_qty: cur ? Number(cur.quantity) : 0,
      approved_qty_before: cur && cur.approved_qty != null ? Number(cur.approved_qty) : null,
      approved_qty_after: adj.approvedQty,
    };
  });
  await logAudit(supabase, {
    action: 'adjust',
    entity: 'van_stock_request',
    entityId: input.requestId,
    details: { reason: input.reason, adjusted_by: ctx.userId, lines: auditLines, changes },
    companyId: ctx.companyId,
  });
  return { ok: true, changes };
}

/** ── Van Sales (Phase B) — supervisor-direct load assignment ────────────────
 *  A supervisor creates a load manifest for a salesman directly (no stock
 *  request), choosing the source warehouse + the van + the loaded lines. The load
 *  is created in 'loaded' state; the SALESMAN must still confirm it (accept /
 *  reject / variance) before any stock posts — there is NO auto-confirmation.
 *  stock.adjust gated; audited. */

export interface DirectLoadLineInput {
  productId: string;
  loadedQty: number;
}

export interface CreateDirectLoadInput {
  salesmanId: string;
  warehouseId: string;       // the van (destination)
  sourceWarehouseId: string; // where the goods come from
  lines: DirectLoadLineInput[];
  notes?: string;
}

export interface CreateDirectLoadResult {
  ok: boolean;
  error?: string;
  manifestId?: string;
}

export async function createDirectLoad(input: CreateDirectLoadInput): Promise<CreateDirectLoadResult> {
  if (!VAN_SALES_ENABLED()) return { ok: false, error: 'disabled' };

  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: 'unauthorized' };
  if (!ctx.companyId) return { ok: false, error: 'no company' };
  if (!hasPermission(ctx, 'stock.adjust') && !ctx.isSuperAdmin) return { ok: false, error: 'unauthorized' };
  if (!input.salesmanId || !input.warehouseId || !input.sourceWarehouseId) return { ok: false, error: 'missing fields' };
  const lines = (input.lines ?? []).filter((l) => l.loadedQty > 0);
  if (lines.length === 0) return { ok: false, error: 'no lines' };

  const supabase = await createClient();
  const { data: wh } = await supabase.from('erp_warehouses').select('branch_id').eq('id', input.warehouseId).maybeSingle();
  const branchId = (wh as { branch_id: string } | null)?.branch_id;
  if (!branchId) return { ok: false, error: 'warehouse not found' };

  // BL-5: canonical atomic branch-scoped number (was Date.now()+random, no unique).
  const { data: manifestNumber, error: manNumErr } = await supabase.rpc('erp_next_number', {
    p_branch_id: branchId, p_seq_type: 'van_load',
  });
  if (manNumErr || !manifestNumber) return { ok: false, error: manNumErr?.message ?? 'numbering failed' };
  const { data: man, error } = await supabase
    .from('erp_van_load_manifests')
    .insert({
      branch_id: branchId,
      warehouse_id: input.warehouseId,
      source_warehouse_id: input.sourceWarehouseId,
      salesman_id: input.salesmanId,
      manifest_number: manifestNumber as string,
      status: 'loaded',
      notes: input.notes ?? null,
      created_by: ctx.userId,
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };
  const manifestId = (man as { id: string }).id;

  const { error: lErr } = await supabase
    .from('erp_van_load_manifest_lines')
    .insert(lines.map((l) => ({ manifest_id: manifestId, product_id: l.productId, loaded_qty: l.loadedQty })));
  if (lErr) return { ok: false, error: lErr.message, manifestId };

  await logAudit(supabase, {
    action: 'create',
    entity: 'van_direct_load',
    entityId: manifestId,
    details: { salesman_id: input.salesmanId, source_warehouse_id: input.sourceWarehouseId, van: input.warehouseId, lines: lines.length },
    companyId: ctx.companyId,
  });
  return { ok: true, manifestId };
}
