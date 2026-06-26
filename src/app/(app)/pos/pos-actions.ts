'use server';

// ============================================================================
// Fast Food / Restaurant POS — server actions. Built ON TOP of the existing restaurant
// module: the fast cashier builds the ticket client-side (instant taps), then ONE checkout
// call persists the order + items and runs the atomic erp_close_restaurant_order RPC (totals
// + GL posting + frees the table). Reuses erp_products_catalog (menu), erp_restaurant_orders /
// erp_restaurant_order_items (ticket), and restaurant.manage (cashier already holds it).
// Company-scoped via RLS; no new tables. Field Verification / Route Planner untouched.
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { requirePermission, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { logAudit } from '@/lib/erp/audit';
import { ATTACHMENTS_BUCKET, validateAttachment, safeExtension } from '@/lib/erp/attachments';
import { buildPosInvoice } from './pos-invoice';
import type { OrderMode, DiscountType, CartCharges } from './pos-cart';

const isHttp = (s: string | null) => !!s && /^https?:\/\//i.test(s);

/** Resolve product image refs: external URLs pass through; storage PATHS are batch-signed.
 *  Keeps the POS grid fast (one signing round-trip) and reuses the attachments bucket. */
async function resolveImages(sb: Awaited<ReturnType<typeof createClient>>, products: PosProduct[]): Promise<void> {
  const paths = [...new Set(products.map((p) => p.imageUrl).filter((u): u is string => !!u && !isHttp(u)))];
  if (paths.length === 0) return;
  const { data } = await sb.storage.from(ATTACHMENTS_BUCKET).createSignedUrls(paths, 3600);
  const byPath = new Map<string, string>();
  for (const r of data ?? []) if (r.path && r.signedUrl) byPath.set(r.path, r.signedUrl);
  for (const p of products) if (p.imageUrl && !isHttp(p.imageUrl)) p.imageUrl = byPath.get(p.imageUrl) ?? null;
}

export interface PosCategory { id: string; name: string; nameAr: string | null; sort: number }
export interface PosProduct {
  id: string; code: string | null; name: string; nameAr: string | null;
  barcode: string | null; categoryId: string | null; price: number; taxRate: number; imageUrl: string | null;
}
export interface PosTable { id: string; name: string; status: string }
export interface PosBootstrap { categories: PosCategory[]; products: PosProduct[]; tables: PosTable[] }

type ResultD<T> = { ok: true; data: T } | { ok: false; error: string };

/** Menu + categories + dine-in tables for the POS, in one fast call. Company-scoped (RLS). */
export async function getPosBootstrap(): Promise<ResultD<PosBootstrap>> {
  const ctx = await requirePermission('restaurant.manage');
  if (!ctx.companyId) return { ok: false, error: 'err_no_company' };
  const sb = await createClient();

  const [{ data: prods, error: pe }, { data: cats }, { data: tabs }] = await Promise.all([
    sb.from('erp_products_catalog')
      .select('id, code, name, name_ar, barcode, category_id, sell_price, tax_rate, image_url')
      .eq('company_id', ctx.companyId).eq('is_active', true)
      .order('name', { ascending: true }).limit(2000),
    sb.from('erp_product_categories')
      .select('id, name, name_ar, sort_order')
      .eq('company_id', ctx.companyId).eq('is_active', true)
      .order('sort_order', { ascending: true }).order('name', { ascending: true }),
    sb.from('erp_restaurant_tables')
      .select('id, name, status')
      .eq('company_id', ctx.companyId).eq('is_active', true)
      .order('sort', { ascending: true }).order('name', { ascending: true }),
  ]);
  if (pe) return { ok: false, error: friendlyDbError(pe) };

  const products: PosProduct[] = (prods ?? []).map((p) => ({
    id: p.id as string, code: (p.code as string | null) ?? null,
    name: (p.name as string) ?? '', nameAr: (p.name_ar as string | null) ?? null,
    barcode: (p.barcode as string | null) ?? null, categoryId: (p.category_id as string | null) ?? null,
    price: Number(p.sell_price ?? 0), taxRate: Number(p.tax_rate ?? 0), imageUrl: (p.image_url as string | null) ?? null,
  }));
  await resolveImages(sb, products);

  return {
    ok: true,
    data: {
      categories: (cats ?? []).map((c) => ({ id: c.id as string, name: (c.name as string) ?? '', nameAr: (c.name_ar as string | null) ?? null, sort: Number(c.sort_order ?? 0) })),
      products,
      tables: (tabs ?? []).map((t) => ({ id: t.id as string, name: (t.name as string) ?? '', status: (t.status as string) ?? 'free' })),
    },
  };
}

/** Product list for POS setup (image management). Resolves current images to signed URLs. */
export async function getPosSetupProducts(): Promise<ResultD<PosProduct[]>> {
  const ctx = await requirePermission('restaurant.manage');
  if (!ctx.companyId) return { ok: false, error: 'err_no_company' };
  const sb = await createClient();
  const { data, error } = await sb.from('erp_products_catalog')
    .select('id, code, name, name_ar, barcode, category_id, sell_price, tax_rate, image_url')
    .eq('company_id', ctx.companyId).eq('is_active', true).order('name', { ascending: true }).limit(2000);
  if (error) return { ok: false, error: friendlyDbError(error) };
  const products: PosProduct[] = (data ?? []).map((p) => ({
    id: p.id as string, code: (p.code as string | null) ?? null, name: (p.name as string) ?? '', nameAr: (p.name_ar as string | null) ?? null,
    barcode: (p.barcode as string | null) ?? null, categoryId: (p.category_id as string | null) ?? null,
    price: Number(p.sell_price ?? 0), taxRate: Number(p.tax_rate ?? 0), imageUrl: (p.image_url as string | null) ?? null,
  }));
  await resolveImages(sb, products);
  return { ok: true, data: products };
}

/** Upload/replace a product image (admin). Stores into the attachments bucket and writes the
 *  storage PATH to erp_products_catalog.image_url (the POS loader signs it on read). Reuses the
 *  shared media bucket; gated restaurant.manage; company-scoped; audited. */
export async function uploadProductImage(productId: string, formData: FormData): Promise<ActionResult> {
  const ctx = await requirePermission('restaurant.manage');
  if (!ctx.companyId) return { ok: false, error: 'err_no_company' };
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'err_no_file' };
  const v = validateAttachment({ type: file.type, size: file.size });
  if (!v.ok) return { ok: false, error: v.error };
  const sb = await createClient();
  // confirm the product belongs to the company (RLS also enforces)
  const { data: prod } = await sb.from('erp_products_catalog').select('id').eq('id', productId).eq('company_id', ctx.companyId).maybeSingle();
  if (!prod) return { ok: false, error: 'err_not_found' };
  const path = `${ctx.companyId}/product/${productId}/${crypto.randomUUID()}.${safeExtension(file.name, file.type)}`;
  const { error: upErr } = await sb.storage.from(ATTACHMENTS_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return { ok: false, error: upErr.message };
  const { error } = await sb.from('erp_products_catalog').update({ image_url: path }).eq('id', productId).eq('company_id', ctx.companyId);
  if (error) return { ok: false, error: friendlyDbError(error) };
  await logAudit(sb, { action: 'update', entity: 'product', entityId: productId, companyId: ctx.companyId, details: { image: true } });
  return { ok: true };
}

export interface PosCheckoutItem { productId: string; name: string; price: number; qty: number; note?: string | null }
export interface PosCheckoutInput {
  mode: OrderMode;
  tableId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
  deliveryFee?: number;
  discountType?: DiscountType;
  discountValue?: number;
  serviceRate?: number;
  taxRate?: number;
  orderNote?: string | null;
  paymentMethod: 'cash' | 'card' | 'mixed';
  items: PosCheckoutItem[];
  /** Client-generated UUID for offline-sync idempotency: the official invoice is issued
   *  exactly once per (company, clientUuid). A retry/sync with the same value returns the
   *  already-issued invoice instead of creating a duplicate official number. */
  clientUuid?: string | null;
}

export interface PosCheckoutResult { orderId: string; invoiceId: string; invoiceNumber: string; deduped?: boolean }

/**
 * One-shot checkout: create the order + items, then close it (atomic totals + GL via
 * erp_close_restaurant_order). Returns the order id for the receipt. For a 'mixed' tender the
 * GL posts via the dominant method (cash|card) while the order records payment_method='mixed'
 * for reporting — no GL corruption, just a v1 simplification of the split.
 */
export async function posCheckout(input: PosCheckoutInput): Promise<ActionResult<PosCheckoutResult>> {
  const ctx = await requirePermission('restaurant.manage');
  if (!ctx.companyId) return { ok: false, error: 'err_no_company' };
  const items = (input.items ?? []).filter((i) => i.productId && i.qty > 0);
  if (items.length === 0) return { ok: false, error: 'err_no_items' };

  const mode: OrderMode = ['dine_in', 'takeaway', 'delivery'].includes(input.mode) ? input.mode : 'takeaway';
  const num = (n: number | undefined) => (Number.isFinite(n) && (n as number) >= 0 ? (n as number) : 0);
  const sb = await createClient();

  // Idempotency: if this clientUuid was already issued (offline sync retry), return it — never
  // mint a second official invoice number for the same sale.
  if (input.clientUuid) {
    const { data: existing } = await sb.from('erp_pos_invoices')
      .select('id, invoice_number, order_id').eq('company_id', ctx.companyId).eq('client_uuid', input.clientUuid).maybeSingle();
    if (existing) return { ok: true, data: { orderId: (existing.order_id as string) ?? '', invoiceId: existing.id as string, invoiceNumber: (existing.invoice_number as string) ?? '', deduped: true } };
  }

  const { data: order, error: e1 } = await sb.from('erp_restaurant_orders').insert({
    company_id: ctx.companyId,
    table_id: mode === 'dine_in' ? input.tableId || null : null,
    order_type: mode,
    status: 'open',
    customer_name: input.customerName?.trim() || null,
    customer_phone: input.customerPhone?.trim() || null,
    customer_address: input.customerAddress?.trim() || null,
    delivery_fee: mode === 'delivery' ? num(input.deliveryFee) : 0,
    discount_type: input.discountType === 'percent' ? 'percent' : 'amount',
    discount_value: num(input.discountValue),
    service_rate: num(input.serviceRate),
    tax_rate: num(input.taxRate),
    notes: input.orderNote?.trim() || null,
    created_by: ctx.userId,
  }).select('id').single();
  if (e1 || !order) return { ok: false, error: e1 ? friendlyDbError(e1) : 'err_insert' };
  const orderId = order.id as string;

  const itemRows = items.map((i) => ({
    company_id: ctx.companyId, order_id: orderId, product_id: i.productId,
    name: i.name, qty: Math.round(i.qty), price: Number(i.price) || 0, notes: i.note?.trim() || null,
  }));
  const { error: e2 } = await sb.from('erp_restaurant_order_items').insert(itemRows);
  if (e2) return { ok: false, error: friendlyDbError(e2) };

  // Close (atomic totals + GL posting + table free). RPC supports cash|card; mixed → cash leg.
  const rpcMethod = input.paymentMethod === 'card' ? 'card' : 'cash';
  const { error: e3 } = await sb.rpc('erp_close_restaurant_order', { p_order_id: orderId, p_payment_method: rpcMethod });
  if (e3) return { ok: false, error: friendlyDbError(e3) };

  // Record the true tender label (cash/card/mixed) for reporting (close set cash|card).
  if (input.paymentMethod === 'mixed') {
    await sb.from('erp_restaurant_orders').update({ payment_method: 'mixed' }).eq('id', orderId).eq('company_id', ctx.companyId);
  }

  // ── ZATCA-ready invoice: snapshot a structured, regenerate-able invoice + Phase-1 QR. ──
  const charges: CartCharges = {
    discountType: input.discountType === 'percent' ? 'percent' : 'amount', discountValue: num(input.discountValue),
    serviceRate: num(input.serviceRate), taxRate: num(input.taxRate), deliveryFee: mode === 'delivery' ? num(input.deliveryFee) : 0,
  };
  const { data: company } = await sb.from('erp_companies').select('name, tax_number').eq('id', ctx.companyId).maybeSingle();
  const seller = { name: (company?.name as string) ?? '', vat: (company?.tax_number as string | null) ?? null, branch: null };
  const built = buildPosInvoice({
    lines: items.map((i) => ({ productId: i.productId, name: i.name, price: i.price, taxRate: 0, qty: i.qty, note: i.note ?? null })),
    charges, orderType: mode, issueAt: new Date().toISOString(), seller,
    customer: { name: input.customerName ?? null, phone: input.customerPhone ?? null, address: input.customerAddress ?? null },
    paymentMethod: input.paymentMethod,
  });

  let invoiceId = '';
  let invoiceNumber = '';
  const { data: noData } = await sb.rpc('erp_pos_next_invoice_no', { p_company: ctx.companyId });
  invoiceNumber = (noData as string) ?? '';
  if (invoiceNumber) {
    const { data: inv } = await sb.from('erp_pos_invoices').insert({
      company_id: ctx.companyId, order_id: orderId, invoice_number: invoiceNumber,
      invoice_type: built.payload.type, doc_type: 'invoice', order_type: mode, payment_method: input.paymentMethod,
      seller_name: seller.name, seller_vat: seller.vat,
      customer_name: input.customerName?.trim() || null, customer_phone: input.customerPhone?.trim() || null,
      subtotal: built.payload.totals.subtotal, discount_total: built.payload.totals.discount,
      service_total: built.payload.totals.service, tax_total: built.payload.totals.tax, grand_total: built.payload.totals.grandTotal,
      status: 'issued', payload: built.payload, zatca_qr: built.qr, created_by: ctx.userId,
      client_uuid: input.clientUuid ?? null,
    }).select('id').single();
    invoiceId = (inv?.id as string) ?? '';
    if (invoiceId) await logAudit(sb, { action: 'issue', entity: 'pos_invoice', entityId: invoiceId, companyId: ctx.companyId, details: { invoice_number: invoiceNumber, total: built.payload.totals.grandTotal } });
  }

  return { ok: true, data: { orderId, invoiceId, invoiceNumber } };
}

// ── Receipt + void (ZATCA-ready invoice ledger; reads/voids never delete) ──

export interface PosInvoiceView {
  id: string; invoiceNumber: string; invoiceType: string; docType: string; status: string;
  issueAt: string; sellerName: string | null; sellerVat: string | null;
  customerName: string | null; orderType: string | null; paymentMethod: string | null;
  cashierName: string | null;
  subtotal: number; discountTotal: number; serviceTotal: number; taxTotal: number; grandTotal: number;
  zatcaQr: string | null; zatcaStatus: string;
  lines: { name: string; qty: number; unitPrice: number; total: number; note?: string | null }[];
}

/** Read a POS invoice for the receipt (company-scoped via RLS). */
export async function getPosInvoice(id: string): Promise<ResultD<PosInvoiceView>> {
  const sb = await createClient();
  const { data, error } = await sb.from('erp_pos_invoices')
    .select('id, invoice_number, invoice_type, doc_type, status, issue_at, seller_name, seller_vat, customer_name, order_type, payment_method, created_by, subtotal, discount_total, service_total, tax_total, grand_total, zatca_qr, zatca_status, payload')
    .eq('id', id).maybeSingle();
  if (error || !data) return { ok: false, error: error?.message ?? 'err_not_found' };
  const payload = (data.payload as { lines?: { name: string; qty: number; unitPrice: number; total: number; note?: string | null }[] } | null) ?? {};
  let cashierName: string | null = null;
  if (data.created_by) {
    const { data: prof } = await sb.from('erp_profiles').select('full_name, email').eq('id', data.created_by as string).maybeSingle();
    cashierName = (prof?.full_name as string) || (prof?.email as string) || null;
  }
  return {
    ok: true,
    data: {
      id: data.id as string, invoiceNumber: (data.invoice_number as string) ?? '', invoiceType: (data.invoice_type as string) ?? '',
      docType: (data.doc_type as string) ?? 'invoice', status: (data.status as string) ?? 'issued', issueAt: (data.issue_at as string) ?? '',
      sellerName: (data.seller_name as string | null) ?? null, sellerVat: (data.seller_vat as string | null) ?? null,
      customerName: (data.customer_name as string | null) ?? null, orderType: (data.order_type as string | null) ?? null,
      paymentMethod: (data.payment_method as string | null) ?? null, cashierName,
      subtotal: Number(data.subtotal ?? 0), discountTotal: Number(data.discount_total ?? 0), serviceTotal: Number(data.service_total ?? 0),
      taxTotal: Number(data.tax_total ?? 0), grandTotal: Number(data.grand_total ?? 0),
      zatcaQr: (data.zatca_qr as string | null) ?? null, zatcaStatus: (data.zatca_status as string) ?? 'not_reported',
      lines: payload.lines ?? [],
    },
  };
}

/** Void a POS invoice → permission-checked SECURITY DEFINER RPC creates a credit-note reversal
 *  (never deletes the original). Returns the new credit-note id. */
export async function voidPosInvoice(invoiceId: string, reason?: string): Promise<ActionResult<{ creditNoteId: string }>> {
  const ctx = await requirePermission('restaurant.manage');
  if (!ctx.companyId) return { ok: false, error: 'err_no_company' };
  const sb = await createClient();
  const { data, error } = await sb.rpc('erp_pos_void_invoice', { p_invoice_id: invoiceId, p_reason: reason ?? null });
  if (error) return { ok: false, error: friendlyDbError(error) };
  await logAudit(sb, { action: 'void', entity: 'pos_invoice', entityId: invoiceId, companyId: ctx.companyId, details: { reason: reason ?? null } });
  return { ok: true, data: { creditNoteId: (data as string) ?? '' } };
}
