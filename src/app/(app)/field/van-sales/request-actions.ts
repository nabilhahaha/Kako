'use server';

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { recordEvent } from '@/lib/workflow/emit';
import { logAudit } from '@/lib/erp/audit';
import { VAN_SALES_ENABLED } from '@/lib/van-sales';

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

  const requestNumber = `VLR-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
  const { data: req, error } = await supabase
    .from('erp_stock_requests')
    .insert({
      request_number: requestNumber,
      branch_id: branchId,
      from_warehouse_id: input.fromWarehouseId,
      to_warehouse_id: input.toWarehouseId,
      status: 'pending',
      origin: 'salesman',
      notes: input.notes ?? null,
      requested_by: ctx.userId,
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
