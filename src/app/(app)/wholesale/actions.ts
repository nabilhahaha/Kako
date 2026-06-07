'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requirePermission, requireAnyPermission, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { type LineInput } from '@/lib/erp/sales-calc';
import type { PaymentMethod } from '@/lib/erp/types';
import { getT } from '@/lib/i18n/server';
import { wholesaleInvoiceCore } from '@/lib/erp/sales/invoice-core';

/** Create a wholesale invoice with per-line prices (tier-prefilled or edited),
 *  optionally collecting cash now; otherwise it's a credit (آجل) sale. The logic
 *  lives in wholesaleInvoiceCore so the reconciliation worker replays an offline
 *  order through the same audited path. */
export async function wholesaleInvoice(input: {
  branch_id: string;
  customer_id: string;
  lines: LineInput[];
  collect: boolean;
  payment_method: PaymentMethod;
}): Promise<ActionResult<{ invoice_id: string; invoice_number: string }>> {
  const { t } = await getT();
  const ctx = await requireAnyPermission(['wholesale.pricing', 'sales.sell']);
  const supabase = await createClient();
  const res = await wholesaleInvoiceCore(supabase, { userId: ctx.userId, companyId: ctx.companyId }, t, input);
  if (res.ok) revalidatePath('/wholesale');
  return res;
}

export async function upsertTier(formData: FormData): Promise<ActionResult> {
  const { t } = await getT();
  const ctx = await requirePermission('wholesale.pricing');
  if (!ctx.companyId) return { ok: false, error: t('wholesale.noCompany') };
  const id = String(formData.get('id') || '').trim();
  const name = String(formData.get('name') || '').trim();
  if (!name) return { ok: false, error: t('wholesale.errTierNameRequired') };
  const sort = Number(formData.get('sort') || 0);
  const row = { name, sort: Number.isFinite(sort) ? Math.round(sort) : 0, is_active: String(formData.get('is_active') || 'true') !== 'false' };
  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from('erp_wholesale_tiers').update(row).eq('id', id);
    if (error) return { ok: false, error: friendlyDbError(error) };
  } else {
    const { error } = await supabase.from('erp_wholesale_tiers').insert({ ...row, company_id: ctx.companyId });
    if (error) return { ok: false, error: friendlyDbError(error) };
  }
  revalidatePath('/wholesale');
  return { ok: true };
}

export async function setPrice(tierId: string, productId: string, price: number): Promise<ActionResult> {
  const { t } = await getT();
  const ctx = await requirePermission('wholesale.pricing');
  if (!ctx.companyId) return { ok: false, error: t('wholesale.noCompany') };
  if (!Number.isFinite(price) || price < 0) return { ok: false, error: t('wholesale.errInvalidPrice') };
  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_wholesale_prices')
    .upsert({ company_id: ctx.companyId, tier_id: tierId, product_id: productId, price }, { onConflict: 'tier_id,product_id' });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/wholesale/prices');
  return { ok: true };
}

export async function setCustomerTier(customerId: string, tierId: string | null): Promise<ActionResult> {
  const { t } = await getT();
  const ctx = await requirePermission('wholesale.pricing');
  if (!ctx.companyId) return { ok: false, error: t('wholesale.noCompany') };
  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_wholesale_customer_tier')
    .upsert({ customer_id: customerId, company_id: ctx.companyId, tier_id: tierId || null, updated_at: new Date().toISOString() }, { onConflict: 'customer_id' });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/wholesale/customers');
  return { ok: true };
}
