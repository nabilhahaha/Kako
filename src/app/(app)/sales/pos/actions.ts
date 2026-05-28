'use server';

import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/erp/guards';
import type { LineInput } from '@/lib/erp/sales-calc';
import type { PaymentMethod } from '@/lib/erp/types';
import { createInvoice, issueInvoice, recordPayment } from '../invoices/actions';

/**
 * One-tap field sale: create the invoice, issue it (stock + AR/Revenue
 * journal), and optionally collect payment — all in sequence.
 */
export async function quickSale(input: {
  branch_id: string;
  customer_id: string;
  lines: LineInput[];
  pay: boolean;
  amount: number;
  payment_method: PaymentMethod;
}): Promise<ActionResult<{ invoice_number: string }>> {
  const created = await createInvoice({
    branch_id: input.branch_id,
    customer_id: input.customer_id,
    lines: input.lines,
  });
  if (!created.ok || !created.data) return { ok: false, error: created.error };

  const issued = await issueInvoice(created.data.id);
  if (!issued.ok) {
    return { ok: false, error: `أُنشئت الفاتورة كمسودة لكن تعذّر إصدارها: ${issued.error}` };
  }

  if (input.pay && input.amount > 0) {
    const paid = await recordPayment({
      invoice_id: created.data.id,
      amount: input.amount,
      payment_method: input.payment_method,
    });
    if (!paid.ok) {
      return { ok: false, error: `صدرت الفاتورة لكن تعذّر التحصيل: ${paid.error}` };
    }
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_invoices')
    .select('invoice_number')
    .eq('id', created.data.id)
    .single();

  return { ok: true, data: { invoice_number: data?.invoice_number ?? '' } };
}
