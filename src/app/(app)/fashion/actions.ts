'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requirePermission, requireAnyPermission, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { getT } from '@/lib/i18n/server';
import { buildSku, buildBarcode } from '@/lib/fashion/sku';

function revalidate() {
  for (const p of ['/fashion', '/fashion/products', '/fashion/sell', '/fashion/installments',
    '/fashion/customers', '/fashion/suppliers', '/fashion/cashbox', '/fashion/reports', '/fashion/inventory']) {
    revalidatePath(p);
  }
}

/** Resolve the company's working branch (prefer HQ, else first active). */
async function resolveBranch(companyId: string, given?: string | null): Promise<string | null> {
  if (given) return given;
  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_branches').select('id, is_hq')
    .eq('company_id', companyId).eq('is_active', true)
    .order('is_hq', { ascending: false }).order('code').limit(1);
  return (data?.[0] as { id: string } | undefined)?.id ?? null;
}

// ─── Master data (color / size / season / brand) ─────────────────────────────
type LookupKind = 'color' | 'size' | 'season' | 'brand';
const LOOKUP_TABLE: Record<LookupKind, string> = {
  color: 'erp_fashion_colors', size: 'erp_fashion_sizes',
  season: 'erp_fashion_seasons', brand: 'erp_fashion_brands',
};

export async function upsertFashionLookup(kind: LookupKind, formData: FormData): Promise<ActionResult> {
  const { t } = await getT();
  const ctx = await requirePermission('fashion.inventory');
  if (!ctx.companyId) return { ok: false, error: t('fashion.errors.noCompany') };
  const name = String(formData.get('name') || '').trim();
  if (!name) return { ok: false, error: t('fashion.errors.required') };
  const code = (String(formData.get('code') || '').trim() || name).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24) || name;
  const row: Record<string, unknown> = { company_id: ctx.companyId, code, name };
  if (kind === 'color') row.hex = String(formData.get('hex') || '').trim() || null;
  if (kind === 'size') row.size_group = String(formData.get('size_group') || 'apparel').trim() || 'apparel';
  const supabase = await createClient();
  const { error } = await supabase.from(LOOKUP_TABLE[kind]).insert(row);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidate();
  return { ok: true };
}

// ─── Styles & variants ───────────────────────────────────────────────────────
export async function createStyle(formData: FormData): Promise<ActionResult<string>> {
  const { t } = await getT();
  const ctx = await requirePermission('fashion.inventory');
  if (!ctx.companyId) return { ok: false, error: t('fashion.errors.noCompany') };
  const name = String(formData.get('name') || '').trim();
  if (!name) return { ok: false, error: t('fashion.errors.required') };
  const supabase = await createClient();
  const { data, error } = await supabase.from('erp_fashion_styles').insert({
    company_id: ctx.companyId, name,
    name_ar: String(formData.get('name_ar') || '').trim() || null,
    code: String(formData.get('code') || '').trim() || null,
    category_id: String(formData.get('category_id') || '').trim() || null,
    brand_id: String(formData.get('brand_id') || '').trim() || null,
    season_id: String(formData.get('season_id') || '').trim() || null,
    gender: String(formData.get('gender') || '').trim() || null,
    default_supplier_id: String(formData.get('default_supplier_id') || '').trim() || null,
    created_by: ctx.userId,
  }).select('id').single();
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidate();
  return { ok: true, data: (data as { id: string }).id };
}

export async function createVariant(formData: FormData): Promise<ActionResult> {
  const { t } = await getT();
  const ctx = await requirePermission('fashion.inventory');
  if (!ctx.companyId) return { ok: false, error: t('fashion.errors.noCompany') };
  const styleId = String(formData.get('style_id') || '').trim();
  if (!styleId) return { ok: false, error: t('fashion.errors.required') };
  const supabase = await createClient();

  const { data: styleData } = await supabase
    .from('erp_fashion_styles').select('name, code, category_id').eq('id', styleId).maybeSingle();
  const style = styleData as { name: string; code: string | null; category_id: string | null } | null;
  if (!style) return { ok: false, error: t('fashion.errors.notFound') };

  const sizeId = String(formData.get('size_id') || '').trim() || null;
  const colorId = String(formData.get('color_id') || '').trim() || null;
  const [sizeCode, colorCode] = await Promise.all([
    sizeId ? supabase.from('erp_fashion_sizes').select('code').eq('id', sizeId).maybeSingle() : Promise.resolve({ data: null }),
    colorId ? supabase.from('erp_fashion_colors').select('code').eq('id', colorId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const sc = (sizeCode.data as { code: string } | null)?.code ?? null;
  const cc = (colorCode.data as { code: string } | null)?.code ?? null;

  const sku = String(formData.get('sku') || '').trim() || buildSku(style.code || style.name, sc, cc);
  const barcode = String(formData.get('barcode') || '').trim() || buildBarcode(sku);
  const cost = Number(formData.get('cost_price') || 0);
  const cash = Number(formData.get('cash_price') || 0);
  const installment = Number(formData.get('installment_price') || 0);
  const minStock = Number(formData.get('min_stock') || 0);
  const openingQty = Number(formData.get('opening_qty') || 0);
  const label = [style.name, sc, cc].filter(Boolean).join(' / ');

  // 1) the variant's catalog row (SKU/barcode/cost/cash price/min-stock/status)
  const { data: prod, error: pErr } = await supabase.from('erp_products_catalog').insert({
    company_id: ctx.companyId, code: sku, name: label, barcode,
    category_id: style.category_id, unit: 'piece',
    cost_price: Number.isFinite(cost) ? cost : 0,
    sell_price: Number.isFinite(cash) ? cash : 0,
    min_stock: Number.isFinite(minStock) ? minStock : 0,
    is_active: true,
  }).select('id').single();
  if (pErr) return { ok: false, error: friendlyDbError(pErr) };
  const productId = (prod as { id: string }).id;

  // 2) the variant sidecar (size / color / installment price)
  const { error: vErr } = await supabase.from('erp_fashion_variants').insert({
    company_id: ctx.companyId, style_id: styleId, product_id: productId,
    size_id: sizeId, color_id: colorId,
    installment_price: Number.isFinite(installment) ? installment : 0,
  });
  if (vErr) return { ok: false, error: friendlyDbError(vErr) };

  // 3) opening stock (optional)
  if (openingQty > 0) {
    const branchId = await resolveBranch(ctx.companyId);
    if (branchId) {
      const { data: wh } = await supabase.from('erp_warehouses')
        .select('id').eq('branch_id', branchId).eq('is_active', true).order('is_van').order('code').limit(1);
      const warehouseId = (wh?.[0] as { id: string } | undefined)?.id;
      if (warehouseId) {
        await supabase.from('erp_stock_movements').insert({
          movement_type: 'opening_balance', warehouse_id: warehouseId, product_id: productId,
          quantity: openingQty, reference_type: 'fashion_variant', notes: 'رصيد افتتاحي', created_by: ctx.userId,
        });
      }
    }
  }
  revalidate();
  return { ok: true };
}

// ─── Sale (cash / installment) ───────────────────────────────────────────────
export interface CheckoutPayload {
  branchId?: string | null;
  customerId?: string | null;
  lines: { product_id: string; quantity: number; unit_price: number; discount_pct?: number }[];
  discount?: number;
  saleType: 'cash' | 'installment';
  downPayment?: number;
  installmentCount?: number;
  frequency?: 'weekly' | 'biweekly' | 'monthly';
  startDate?: string | null;
}

export async function checkout(payload: CheckoutPayload): Promise<ActionResult<{ invoiceId: string; invoiceNumber: string }>> {
  const { t } = await getT();
  const ctx = await requirePermission('fashion.sell');
  if (!ctx.companyId) return { ok: false, error: t('fashion.errors.noCompany') };
  if (!payload.lines?.length) return { ok: false, error: t('fashion.errors.emptyCart') };
  if (payload.saleType === 'installment' && !payload.customerId) return { ok: false, error: t('fashion.errors.customerRequired') };
  const branchId = await resolveBranch(ctx.companyId, payload.branchId);
  if (!branchId) return { ok: false, error: t('fashion.errors.noBranch') };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('erp_fashion_checkout', {
    p_branch_id: branchId,
    p_customer_id: payload.customerId ?? null,
    p_lines: payload.lines,
    p_discount: payload.discount ?? 0,
    p_sale_type: payload.saleType,
    p_down_payment: payload.downPayment ?? 0,
    p_installment_count: payload.installmentCount ?? 1,
    p_frequency: payload.frequency ?? 'monthly',
    p_start_date: payload.startDate ?? null,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  const res = data as { invoice_id: string; invoice_number: string };
  revalidate();
  return { ok: true, data: { invoiceId: res.invoice_id, invoiceNumber: res.invoice_number } };
}

// ─── Installment collection ──────────────────────────────────────────────────
export async function collectInstallment(scheduleId: string, amount: number, method = 'cash'): Promise<ActionResult> {
  const { t } = await getT();
  const ctx = await requirePermission('fashion.installments');
  if (!ctx.companyId) return { ok: false, error: t('fashion.errors.noCompany') };
  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_fashion_collect_installment', {
    p_schedule_id: scheduleId, p_amount: amount, p_method: method,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidate();
  return { ok: true };
}

// ─── Cash box ────────────────────────────────────────────────────────────────
export async function openCashbox(formData: FormData): Promise<ActionResult> {
  const { t } = await getT();
  const ctx = await requirePermission('fashion.cashbox');
  if (!ctx.companyId) return { ok: false, error: t('fashion.errors.noCompany') };
  const branchId = await resolveBranch(ctx.companyId, String(formData.get('branch_id') || '') || null);
  if (!branchId) return { ok: false, error: t('fashion.errors.noBranch') };
  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_fashion_open_cashbox', {
    p_branch_id: branchId, p_opening_float: Number(formData.get('opening_float') || 0),
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidate();
  return { ok: true };
}

export async function closeCashbox(sessionId: string, counted: number): Promise<ActionResult> {
  const { t } = await getT();
  const ctx = await requirePermission('fashion.cashbox');
  if (!ctx.companyId) return { ok: false, error: t('fashion.errors.noCompany') };
  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_fashion_close_cashbox', { p_session_id: sessionId, p_counted: counted });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidate();
  return { ok: true };
}

export async function addExpense(formData: FormData): Promise<ActionResult> {
  const { t } = await getT();
  const ctx = await requirePermission('fashion.cashbox');
  if (!ctx.companyId) return { ok: false, error: t('fashion.errors.noCompany') };
  const branchId = await resolveBranch(ctx.companyId, String(formData.get('branch_id') || '') || null);
  if (!branchId) return { ok: false, error: t('fashion.errors.noBranch') };
  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_fashion_add_expense', {
    p_branch_id: branchId,
    p_category: String(formData.get('category') || '').trim() || null,
    p_amount: Number(formData.get('amount') || 0),
    p_paid_from: String(formData.get('paid_from') || 'cash'),
    p_note: String(formData.get('note') || '').trim() || null,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidate();
  return { ok: true };
}

// ─── Customers ───────────────────────────────────────────────────────────────
export async function createCustomer(formData: FormData): Promise<ActionResult> {
  const { t } = await getT();
  const ctx = await requireAnyPermission(['fashion.sell', 'fashion.installments']);
  if (!ctx.companyId) return { ok: false, error: t('fashion.errors.noCompany') };
  const name = String(formData.get('name') || '').trim();
  if (!name) return { ok: false, error: t('fashion.errors.required') };
  const branchId = await resolveBranch(ctx.companyId);
  const supabase = await createClient();
  const code = 'C' + Date.now().toString(36).toUpperCase();
  const { error } = await supabase.from('erp_customers').insert({
    company_id: ctx.companyId, code, name,
    phone: String(formData.get('phone') || '').trim() || null,
    branch_id: branchId, credit_limit: 0, balance: 0,
    is_active: true, is_approved: true, approval_status: 'approved',
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidate();
  return { ok: true };
}

// ─── Suppliers & purchasing ──────────────────────────────────────────────────
export async function createSupplier(formData: FormData): Promise<ActionResult> {
  const { t } = await getT();
  const ctx = await requirePermission('fashion.purchase');
  if (!ctx.companyId) return { ok: false, error: t('fashion.errors.noCompany') };
  const name = String(formData.get('name') || '').trim();
  if (!name) return { ok: false, error: t('fashion.errors.required') };
  const supabase = await createClient();
  const code = 'S' + Date.now().toString(36).toUpperCase();
  const { error } = await supabase.from('erp_suppliers').insert({
    company_id: ctx.companyId, code, name,
    phone: String(formData.get('phone') || '').trim() || null,
    balance: 0, is_active: true,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidate();
  return { ok: true };
}

export async function paySupplier(formData: FormData): Promise<ActionResult> {
  const { t } = await getT();
  const ctx = await requirePermission('fashion.purchase');
  if (!ctx.companyId) return { ok: false, error: t('fashion.errors.noCompany') };
  const supplierId = String(formData.get('supplier_id') || '').trim();
  if (!supplierId) return { ok: false, error: t('fashion.errors.required') };
  const branchId = await resolveBranch(ctx.companyId);
  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_fashion_pay_supplier', {
    p_branch_id: branchId, p_supplier_id: supplierId,
    p_amount: Number(formData.get('amount') || 0),
    p_method: String(formData.get('method') || 'cash'),
    p_note: String(formData.get('note') || '').trim() || null,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidate();
  return { ok: true };
}

export interface PurchasePayload {
  supplierId: string;
  payCash: boolean;
  lines: { product_id: string; quantity: number; unit_cost: number }[];
}

export async function createPurchase(payload: PurchasePayload): Promise<ActionResult> {
  const { t } = await getT();
  const ctx = await requirePermission('fashion.purchase');
  if (!ctx.companyId) return { ok: false, error: t('fashion.errors.noCompany') };
  if (!payload.supplierId || !payload.lines?.length) return { ok: false, error: t('fashion.errors.emptyCart') };
  const branchId = await resolveBranch(ctx.companyId);
  if (!branchId) return { ok: false, error: t('fashion.errors.noBranch') };
  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_fashion_purchase', {
    p_branch_id: branchId, p_supplier_id: payload.supplierId, p_warehouse_id: null,
    p_lines: payload.lines, p_pay_cash: payload.payCash,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidate();
  return { ok: true };
}
