'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requirePermission, requireAnyPermission, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { computeTotals, type LineInput } from '@/lib/erp/sales-calc';
import type { PaymentMethod } from '@/lib/erp/types';
import { createInvoice, issueInvoice, recordPayment } from '../sales/invoices/actions';

const NO_COMPANY = 'هذه العملية تتم من داخل حساب الشركة.';

/** Create a wholesale invoice with per-line prices (tier-prefilled or edited),
 *  optionally collecting cash now; otherwise it's a credit (آجل) sale. */
export async function wholesaleInvoice(input: {
  branch_id: string;
  customer_id: string;
  lines: LineInput[];
  collect: boolean;
  payment_method: PaymentMethod;
}): Promise<ActionResult<{ invoice_id: string; invoice_number: string }>> {
  const ctx = await requireAnyPermission(['wholesale.pricing', 'sales.sell']);
  if (!ctx.companyId) return { ok: false, error: NO_COMPANY };
  if (!input.branch_id) return { ok: false, error: 'الفرع مطلوب.' };
  if (!input.customer_id) return { ok: false, error: 'اختر العميل.' };
  const lines = input.lines.filter((l) => l.product_id && l.quantity > 0);
  if (lines.length === 0) return { ok: false, error: 'أضف صنفاً واحداً على الأقل.' };

  const created = await createInvoice({ branch_id: input.branch_id, customer_id: input.customer_id, lines });
  if (!created.ok || !created.data) return { ok: false, error: created.error };
  const invoiceId = created.data.id;

  const issued = await issueInvoice(invoiceId);
  if (!issued.ok) return { ok: false, error: `تعذّر إصدار الفاتورة: ${issued.error}` };

  if (input.collect) {
    const net = computeTotals(lines).net_amount;
    const paid = await recordPayment({ invoice_id: invoiceId, amount: net, payment_method: input.payment_method });
    if (!paid.ok) return { ok: false, error: `صدرت الفاتورة لكن تعذّر التحصيل: ${paid.error}` };
  }

  const supabase = await createClient();
  const { data } = await supabase.from('erp_invoices').select('invoice_number').eq('id', invoiceId).single();
  return { ok: true, data: { invoice_id: invoiceId, invoice_number: (data as { invoice_number?: string } | null)?.invoice_number ?? '' } };
}

export async function upsertTier(formData: FormData): Promise<ActionResult> {
  const ctx = await requirePermission('wholesale.pricing');
  if (!ctx.companyId) return { ok: false, error: NO_COMPANY };
  const id = String(formData.get('id') || '').trim();
  const name = String(formData.get('name') || '').trim();
  if (!name) return { ok: false, error: 'اسم المستوى مطلوب.' };
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
  const ctx = await requirePermission('wholesale.pricing');
  if (!ctx.companyId) return { ok: false, error: NO_COMPANY };
  if (!Number.isFinite(price) || price < 0) return { ok: false, error: 'سعر غير صحيح.' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_wholesale_prices')
    .upsert({ company_id: ctx.companyId, tier_id: tierId, product_id: productId, price }, { onConflict: 'tier_id,product_id' });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/wholesale/prices');
  return { ok: true };
}

export async function setCustomerTier(customerId: string, tierId: string | null): Promise<ActionResult> {
  const ctx = await requirePermission('wholesale.pricing');
  if (!ctx.companyId) return { ok: false, error: NO_COMPANY };
  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_wholesale_customer_tier')
    .upsert({ customer_id: customerId, company_id: ctx.companyId, tier_id: tierId || null, updated_at: new Date().toISOString() }, { onConflict: 'customer_id' });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/wholesale/customers');
  return { ok: true };
}
