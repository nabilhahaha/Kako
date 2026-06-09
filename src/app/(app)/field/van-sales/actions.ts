'use server';

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { logAudit } from '@/lib/erp/audit';
import {
  VAN_SALES_ENABLED,
  classifyConfirmation,
  missingVarianceReasons,
  type ConfirmationLineInput,
  type LoadConfirmationStatus,
} from '@/lib/van-sales';

/** ── Van Sales (Phase B) — confirm a van load ───────────────────────────────
 *  The salesman accept / reject / accept-with-variance handshake. Records the
 *  immutable confirmation + lines, then posts ONLY the accepted quantity into van
 *  stock via erp_van_confirm_load() (warehouse → van transfer; the ledger trigger
 *  maintains on-hand). Variance never auto-deducts — it sets review_status so the
 *  warehouse → supervisor review picks it up. Audited. Flag-gated. */

export interface ConfirmLoadInput {
  manifestId: string;
  warehouseId?: string; // the van
  salesmanId?: string;
  lines: ConfirmationLineInput[];
  notes?: string;
}

export interface ConfirmLoadResult {
  ok: boolean;
  error?: string;
  id?: string;
  status?: LoadConfirmationStatus;
  requiresReview?: boolean;
  problems?: string[];
}

export async function confirmLoad(input: ConfirmLoadInput): Promise<ConfirmLoadResult> {
  if (!VAN_SALES_ENABLED()) return { ok: false, error: 'disabled' };

  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: 'unauthorized' };
  if (!ctx.companyId) return { ok: false, error: 'no company' };
  if (!hasPermission(ctx, 'field.sales') && !ctx.isSuperAdmin) return { ok: false, error: 'unauthorized' };
  if (!input.manifestId) return { ok: false, error: 'missing manifest' };

  // A variance line must carry a reason (short/extra/damaged/wrong_item/expiry/other).
  const missing = missingVarianceReasons(input.lines);
  if (missing.length) return { ok: false, error: 'variance_reason_required', problems: missing };

  const c = classifyConfirmation(input.lines);
  const supabase = await createClient();

  const { data: conf, error: cErr } = await supabase
    .from('erp_van_load_confirmations')
    .insert({
      manifest_id: input.manifestId,
      warehouse_id: input.warehouseId ?? null,
      salesman_id: input.salesmanId ?? ctx.userId,
      status: c.status,
      requires_review: c.requiresReview,
      review_status: c.requiresReview ? 'pending' : 'none',
      notes: input.notes ?? null,
      created_by: ctx.userId,
      // company_id set by trigger; RLS-scoped.
    })
    .select('id')
    .single();
  if (cErr) return { ok: false, error: cErr.message };
  const id = (conf as { id: string }).id;

  const lineRows = c.lines.map((l) => ({
    confirmation_id: id,
    product_id: l.productId,
    loaded_qty: l.loadedQty,
    accepted_qty: l.acceptedQty,
    variance_qty: l.varianceQty,
    variance_reason: l.reason ?? null,
    notes: l.notes ?? null,
    photo_ref: l.photoRef ?? null,
  }));
  const { error: lErr } = await supabase.from('erp_van_load_confirmation_lines').insert(lineRows);
  if (lErr) return { ok: false, error: lErr.message, id };

  // Post ONLY the accepted quantity to the ledger (warehouse → van). Nothing posts
  // on a full reject. Idempotent server-side (posted_at guard).
  if (c.totalAccepted > 0) {
    const { error: pErr } = await supabase.rpc('erp_van_confirm_load', { p_confirmation_id: id });
    if (pErr) return { ok: false, error: pErr.message, id };
  }

  await logAudit(supabase, {
    action: 'confirm',
    entity: 'van_load_confirmation',
    entityId: id,
    details: { status: c.status, requiresReview: c.requiresReview, totalAccepted: c.totalAccepted, totalVariance: c.totalVariance },
    companyId: ctx.companyId,
  });
  return { ok: true, id, status: c.status, requiresReview: c.requiresReview };
}
