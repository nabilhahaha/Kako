'use server';

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { logAudit } from '@/lib/erp/audit';
import { recordEvent } from '@/lib/workflow/emit';
import {
  VAN_SALES_ENABLED,
  classifyConfirmation,
  missingVarianceReasons,
  invalidAcceptedQuantities,
  type ConfirmationLineInput,
  type LoadConfirmationStatus,
} from '@/lib/van-sales';

/** ── Van Sales (Phase B) — confirm a van load ───────────────────────────────
 *  The salesman accept / reject / accept-with-variance handshake. The ENTIRE flow
 *  (confirmation + lines + ledger posting + posted_at) runs ATOMICALLY inside one
 *  SECURITY DEFINER function (erp_van_confirm_load) — any failure rolls everything
 *  back, so there is no partial confirmation. The RPC re-validates ownership /
 *  company / manifest status / accepted ≤ loaded and posts ONLY the accepted
 *  quantity (warehouse → van). Variance never auto-deducts. Flag-gated. */

export interface ConfirmLoadInput {
  manifestId: string;
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
  if (!hasPermission(ctx, 'field.sales') && !hasPermission(ctx, 'stock.adjust') && !ctx.isSuperAdmin) {
    return { ok: false, error: 'unauthorized' };
  }
  if (!input.manifestId) return { ok: false, error: 'missing manifest' };

  // Client-side guards for a clean error (the RPC re-validates as the trust boundary).
  const badQty = invalidAcceptedQuantities(input.lines);
  if (badQty.length) return { ok: false, error: 'invalid_accepted_qty', problems: badQty };
  const missing = missingVarianceReasons(input.lines);
  if (missing.length) return { ok: false, error: 'variance_reason_required', problems: missing };

  const c = classifyConfirmation(input.lines);
  const supabase = await createClient();

  // One atomic call does everything (insert + post + posted_at) or nothing.
  const { data, error } = await supabase.rpc('erp_van_confirm_load', {
    p_manifest_id: input.manifestId,
    p_status: c.status,
    p_requires_review: c.requiresReview,
    p_notes: input.notes ?? null,
    p_lines: c.lines.map((l) => ({
      product_id: l.productId,
      loaded_qty: l.loadedQty,
      accepted_qty: l.acceptedQty,
      variance_reason: l.reason ?? null,
      notes: l.notes ?? null,
      photo_ref: l.photoRef ?? null,
    })),
  });
  if (error) return { ok: false, error: error.message };
  const id = data as string;

  // A variance (or full reject) raises the warehouse → supervisor review workflow.
  if (c.requiresReview) {
    await recordEvent({
      eventType: 'van_load_variance.raised',
      entity: 'van_load_variance',
      recordId: id,
      payload: { status: c.status, manifest_id: input.manifestId, total_variance: c.totalVariance },
    });
  }

  await logAudit(supabase, {
    action: 'confirm',
    entity: 'van_load_confirmation',
    entityId: id,
    details: { status: c.status, requiresReview: c.requiresReview, totalAccepted: c.totalAccepted },
    companyId: ctx.companyId,
  });
  return { ok: true, id, status: c.status, requiresReview: c.requiresReview };
}
