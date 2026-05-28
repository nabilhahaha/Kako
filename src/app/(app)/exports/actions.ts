'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth, type ActionResult } from '@/lib/erp/guards';
import {
  INVOICE_STATUS_LABELS,
  STOCK_MOVEMENT_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
} from '@/lib/erp/constants';
import type { InvoiceStatus, PaymentMethod, StockMovementType } from '@/lib/erp/types';

type Row = Record<string, string | number>;
const RANGE_LIMIT = 5000;

function range(from: string, to: string) {
  return { gte: `${from}T00:00:00`, lte: `${to}T23:59:59` };
}

/** All invoices in range (header-level raw data). */
export async function exportSalesRows(from: string, to: string): Promise<ActionResult<Row[]>> {
  const { error } = await requireAuth();
  if (error) return { ok: false, error };
  const supabase = await createClient();
  const r = range(from, to);
  const { data } = await supabase
    .from('erp_invoices')
    .select('invoice_number, created_at, status, total_amount, discount_amount, tax_amount, net_amount, paid_amount, customer:erp_customers(name, name_ar), branch:erp_branches(name, name_ar)')
    .gte('created_at', r.gte)
    .lte('created_at', r.lte)
    .order('created_at')
    .limit(RANGE_LIMIT);
  const rows = ((data as unknown as Array<{
    invoice_number: string; created_at: string; status: InvoiceStatus;
    total_amount: number; discount_amount: number; tax_amount: number; net_amount: number; paid_amount: number;
    customer: { name: string; name_ar: string | null } | null;
    branch: { name: string; name_ar: string | null } | null;
  }>) ?? []).map((i) => ({
    'رقم الفاتورة': i.invoice_number,
    'التاريخ': i.created_at.slice(0, 10),
    'الفرع': i.branch?.name_ar || i.branch?.name || '',
    'العميل': i.customer?.name_ar || i.customer?.name || '',
    'الحالة': INVOICE_STATUS_LABELS[i.status]?.ar ?? i.status,
    'الإجمالي': Number(i.total_amount),
    'الخصم': Number(i.discount_amount),
    'الضريبة': Number(i.tax_amount),
    'الصافي': Number(i.net_amount),
    'المدفوع': Number(i.paid_amount),
    'المتبقي': Number(i.net_amount) - Number(i.paid_amount),
  }));
  return { ok: true, data: rows };
}

/** All stock movements in range (raw inventory data). */
export async function exportInventoryRows(from: string, to: string): Promise<ActionResult<Row[]>> {
  const { error } = await requireAuth();
  if (error) return { ok: false, error };
  const supabase = await createClient();
  const r = range(from, to);
  const { data } = await supabase
    .from('erp_stock_movements')
    .select('created_at, movement_type, quantity, reference_type, notes, product:erp_products_catalog(code, name, name_ar), warehouse:erp_warehouses(code, name, name_ar)')
    .gte('created_at', r.gte)
    .lte('created_at', r.lte)
    .order('created_at')
    .limit(RANGE_LIMIT);
  const rows = ((data as unknown as Array<{
    created_at: string; movement_type: StockMovementType; quantity: number; reference_type: string | null; notes: string | null;
    product: { code: string; name: string; name_ar: string | null } | null;
    warehouse: { code: string; name: string; name_ar: string | null } | null;
  }>) ?? []).map((m) => ({
    'التاريخ': m.created_at.slice(0, 10),
    'النوع': STOCK_MOVEMENT_TYPE_LABELS[m.movement_type]?.ar ?? m.movement_type,
    'المخزن': m.warehouse ? `${m.warehouse.code} - ${m.warehouse.name_ar || m.warehouse.name}` : '',
    'كود الصنف': m.product?.code ?? '',
    'الصنف': m.product?.name_ar || m.product?.name || '',
    'الكمية': Number(m.quantity),
    'المرجع': m.reference_type ?? '',
    'ملاحظات': m.notes ?? '',
  }));
  return { ok: true, data: rows };
}

/** All journal lines in range (raw accounting data). */
export async function exportAccountingRows(from: string, to: string): Promise<ActionResult<Row[]>> {
  const { error } = await requireAuth();
  if (error) return { ok: false, error };
  const supabase = await createClient();

  const { data: entries } = await supabase
    .from('erp_journal_entries')
    .select('id, entry_number, entry_date, description, status')
    .gte('entry_date', from)
    .lte('entry_date', to)
    .order('entry_date')
    .limit(RANGE_LIMIT);
  const entryList = entries ?? [];
  if (entryList.length === 0) return { ok: true, data: [] };
  const byId = new Map(entryList.map((e) => [e.id, e]));

  const { data: lines } = await supabase
    .from('erp_journal_lines')
    .select('journal_entry_id, debit, credit, description, account:erp_chart_of_accounts(code, name, name_ar)')
    .in('journal_entry_id', entryList.map((e) => e.id));

  const rows = ((lines as unknown as Array<{
    journal_entry_id: string; debit: number; credit: number; description: string | null;
    account: { code: string; name: string; name_ar: string | null } | null;
  }>) ?? []).map((l) => {
    const e = byId.get(l.journal_entry_id);
    return {
      'رقم القيد': e?.entry_number ?? '',
      'التاريخ': e?.entry_date ?? '',
      'البيان': e?.description ?? '',
      'كود الحساب': l.account?.code ?? '',
      'الحساب': l.account?.name_ar || l.account?.name || '',
      'مدين': Number(l.debit),
      'دائن': Number(l.credit),
      'الحالة': e?.status ?? '',
      'بيان السطر': l.description ?? '',
    };
  });
  return { ok: true, data: rows };
}

/** Payments/collections in range (raw). */
export async function exportPaymentsRows(from: string, to: string): Promise<ActionResult<Row[]>> {
  const { error } = await requireAuth();
  if (error) return { ok: false, error };
  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_payments')
    .select('payment_date, amount, payment_method, reference_number, invoice:erp_invoices(invoice_number, customer:erp_customers(name, name_ar))')
    .gte('payment_date', from)
    .lte('payment_date', to)
    .order('payment_date')
    .limit(RANGE_LIMIT);
  const rows = ((data as unknown as Array<{
    payment_date: string; amount: number; payment_method: PaymentMethod; reference_number: string | null;
    invoice: { invoice_number: string; customer: { name: string; name_ar: string | null } | null } | null;
  }>) ?? []).map((p) => ({
    'التاريخ': p.payment_date,
    'الفاتورة': p.invoice?.invoice_number ?? '',
    'العميل': p.invoice?.customer?.name_ar || p.invoice?.customer?.name || '',
    'الطريقة': PAYMENT_METHOD_LABELS[p.payment_method]?.ar ?? p.payment_method,
    'المبلغ': Number(p.amount),
    'المرجع': p.reference_number ?? '',
  }));
  return { ok: true, data: rows };
}
