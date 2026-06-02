import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logAudit } from './audit';

/** Pricing engine — server helpers (P-b). Wrap the erp_resolve_price() resolver
 *  (migration 0106) and log manual price overrides. The engine reads the
 *  customer's segment/channel/branch to resolve a price; it is independent of the
 *  customer record. */

export interface ResolvedPrice {
  price: number;
  source: string;
}

/** Resolve the engine price for a product/customer (+optional branch/qty/date).
 *  Returns null on any error so callers fall back to manual/base pricing. */
export async function resolvePrice(
  supabase: SupabaseClient,
  args: { productId: string; customerId: string; branchId?: string | null; qty?: number; at?: string },
): Promise<ResolvedPrice | null> {
  if (!args.productId || !args.customerId) return null;
  const { data, error } = await supabase.rpc('erp_resolve_price', {
    p_product_id: args.productId,
    p_customer_id: args.customerId,
    p_branch_id: args.branchId ?? null,
    p_qty: args.qty ?? 1,
    p_at: args.at ?? null,
  });
  if (error || !data) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.price == null) return null;
  return { price: Number(row.price), source: String(row.source) };
}

interface OverrideLine { product_id: string; quantity: number; unit_price: number }

/** After a document is saved, re-resolve each line authoritatively and write an
 *  audit `override` entry for any line whose entered price differs from the
 *  engine price. Best-effort — never blocks the document. */
export async function logPriceOverrides(
  supabase: SupabaseClient,
  args: {
    companyId: string | null;
    entity: string;          // 'invoice' | 'sales_order'
    recordId: string;
    customerId: string;
    branchId?: string | null;
    lines: OverrideLine[];
  },
): Promise<void> {
  for (const l of args.lines) {
    if (!l.product_id) continue;
    const resolved = await resolvePrice(supabase, {
      productId: l.product_id, customerId: args.customerId, branchId: args.branchId, qty: l.quantity,
    });
    if (!resolved) continue;
    if (Math.abs(resolved.price - Number(l.unit_price)) > 0.005) {
      await logAudit(supabase, {
        action: 'override',
        entity: 'price_override',
        entityId: args.recordId,
        companyId: args.companyId,
        details: {
          document: args.entity,
          product_id: l.product_id,
          resolved_price: resolved.price,
          entered_price: Number(l.unit_price),
          source: resolved.source,
        },
      });
    }
  }
}
