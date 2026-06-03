'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requirePermission, requireModuleAction, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { getT } from '@/lib/i18n/server';

// Restaurant / café: tables + orders (dine-in / takeaway / delivery) built from
// the product catalogue (the menu). All actions require restaurant.manage and a
// company. company_id is set by the DB trigger; tenant isolation via RLS.

function revalidate(orderId?: string) {
  revalidatePath('/restaurant');
  revalidatePath('/restaurant/tables');
  revalidatePath('/restaurant/orders');
  revalidatePath('/restaurant/kitchen');
  if (orderId) revalidatePath(`/restaurant/orders/${orderId}`);
}

export async function upsertTable(formData: FormData): Promise<ActionResult> {
  const { t } = await getT();
  const ctx = await requirePermission('restaurant.manage');
  const modErr = requireModuleAction(ctx, 'restaurant');
  if (modErr) return modErr;
  if (!ctx.companyId) return { ok: false, error: t('restaurant.actions.noCompany') };
  const id = String(formData.get('id') || '').trim();
  const name = String(formData.get('name') || '').trim();
  if (!name) return { ok: false, error: t('restaurant.actions.tableNameRequired') };
  const seats = Number(formData.get('seats') || 4);
  const row = {
    name,
    seats: Number.isFinite(seats) && seats > 0 ? Math.round(seats) : 4,
    is_active: String(formData.get('is_active') || 'true') !== 'false',
  };
  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from('erp_restaurant_tables').update(row).eq('id', id);
    if (error) return { ok: false, error: friendlyDbError(error) };
  } else {
    const { error } = await supabase.from('erp_restaurant_tables').insert({ ...row, company_id: ctx.companyId });
    if (error) return { ok: false, error: friendlyDbError(error) };
  }
  revalidate();
  return { ok: true };
}

/** Open a new order. For dine-in it occupies the table (or reuses its open one). */
export async function createOrder(input: {
  table_id?: string | null;
  order_type?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_address?: string;
  delivery_fee?: number;
}): Promise<ActionResult<string>> {
  const { t } = await getT();
  const ctx = await requirePermission('restaurant.manage');
  const modErr = requireModuleAction(ctx, 'restaurant');
  if (modErr) return modErr;
  if (!ctx.companyId) return { ok: false, error: t('restaurant.actions.noCompany') };
  const type = ['dine_in', 'takeaway', 'delivery'].includes(input.order_type || '') ? input.order_type! : 'dine_in';
  const supabase = await createClient();

  // Dine-in: if the table already has an open order, return it instead of dup.
  if (type === 'dine_in' && input.table_id) {
    const { data: existing } = await supabase
      .from('erp_restaurant_orders')
      .select('id')
      .eq('table_id', input.table_id)
      .eq('status', 'open')
      .maybeSingle();
    if (existing?.id) return { ok: true, data: existing.id as string };
  }

  const fee = Number(input.delivery_fee || 0);
  const { data, error } = await supabase
    .from('erp_restaurant_orders')
    .insert({
      company_id: ctx.companyId,
      table_id: type === 'dine_in' ? input.table_id || null : null,
      order_type: type,
      status: 'open',
      customer_name: input.customer_name?.trim() || null,
      customer_phone: input.customer_phone?.trim() || null,
      customer_address: input.customer_address?.trim() || null,
      delivery_fee: Number.isFinite(fee) && fee >= 0 ? fee : 0,
      created_by: ctx.userId,
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: friendlyDbError(error) };

  if (type === 'dine_in' && input.table_id) {
    await supabase.from('erp_restaurant_tables').update({ status: 'occupied' }).eq('id', input.table_id);
  }
  revalidate();
  return { ok: true, data: (data as { id: string }).id };
}

export async function addOrderItem(orderId: string, productId: string): Promise<ActionResult> {
  const { t } = await getT();
  const ctx = await requirePermission('restaurant.manage');
  const modErr = requireModuleAction(ctx, 'restaurant');
  if (modErr) return modErr;
  if (!ctx.companyId) return { ok: false, error: t('restaurant.actions.noCompany') };
  const supabase = await createClient();
  const { data: p } = await supabase
    .from('erp_products_catalog')
    .select('name, name_ar, sell_price')
    .eq('id', productId)
    .maybeSingle();
  const prod = p as { name: string; name_ar: string | null; sell_price: number } | null;
  if (!prod) return { ok: false, error: t('restaurant.actions.itemNotFound') };

  // If the same product is already on the order (and still 'new'), bump qty.
  const { data: existing } = await supabase
    .from('erp_restaurant_order_items')
    .select('id, qty')
    .eq('order_id', orderId)
    .eq('product_id', productId)
    .eq('kitchen_status', 'new')
    .maybeSingle();
  if (existing?.id) {
    const { error } = await supabase
      .from('erp_restaurant_order_items')
      .update({ qty: Number((existing as { qty: number }).qty) + 1 })
      .eq('id', existing.id);
    if (error) return { ok: false, error: friendlyDbError(error) };
  } else {
    const { error } = await supabase.from('erp_restaurant_order_items').insert({
      company_id: ctx.companyId,
      order_id: orderId,
      product_id: productId,
      name: prod.name_ar || prod.name,
      qty: 1,
      price: Number(prod.sell_price || 0),
    });
    if (error) return { ok: false, error: friendlyDbError(error) };
  }
  revalidate(orderId);
  return { ok: true };
}

export async function setItemQty(itemId: string, qty: number, orderId: string): Promise<ActionResult> {
  const { t } = await getT();
  const ctx = await requirePermission('restaurant.manage');
  const modErr = requireModuleAction(ctx, 'restaurant');
  if (modErr) return modErr;
  if (!ctx.companyId) return { ok: false, error: t('restaurant.actions.noCompany') };
  const supabase = await createClient();
  if (qty <= 0) {
    const { error } = await supabase.from('erp_restaurant_order_items').delete().eq('id', itemId);
    if (error) return { ok: false, error: friendlyDbError(error) };
  } else {
    const { error } = await supabase.from('erp_restaurant_order_items').update({ qty: Math.round(qty) }).eq('id', itemId);
    if (error) return { ok: false, error: friendlyDbError(error) };
  }
  revalidate(orderId);
  return { ok: true };
}

export async function setItemNotes(itemId: string, notes: string, orderId: string): Promise<ActionResult> {
  const { t } = await getT();
  const ctx = await requirePermission('restaurant.manage');
  const modErr = requireModuleAction(ctx, 'restaurant');
  if (modErr) return modErr;
  if (!ctx.companyId) return { ok: false, error: t('restaurant.actions.noCompany') };
  const supabase = await createClient();
  const { error } = await supabase.from('erp_restaurant_order_items').update({ notes: notes.trim() || null }).eq('id', itemId);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidate(orderId);
  return { ok: true };
}

export async function setItemKitchenStatus(itemId: string, status: string): Promise<ActionResult> {
  const { t } = await getT();
  const ctx = await requirePermission('restaurant.manage');
  const modErr = requireModuleAction(ctx, 'restaurant');
  if (modErr) return modErr;
  if (!ctx.companyId) return { ok: false, error: t('restaurant.actions.noCompany') };
  if (!['new', 'preparing', 'ready'].includes(status)) return { ok: false, error: t('restaurant.actions.invalidStatus') };
  const supabase = await createClient();
  const { error } = await supabase.from('erp_restaurant_order_items').update({ kitchen_status: status }).eq('id', itemId);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidate();
  return { ok: true };
}

export async function updateOrderMeta(formData: FormData): Promise<ActionResult> {
  const { t } = await getT();
  const ctx = await requirePermission('restaurant.manage');
  const modErr = requireModuleAction(ctx, 'restaurant');
  if (modErr) return modErr;
  if (!ctx.companyId) return { ok: false, error: t('restaurant.actions.noCompany') };
  const id = String(formData.get('id') || '').trim();
  if (!id) return { ok: false, error: t('restaurant.actions.orderRequired') };
  const fee = Number(formData.get('delivery_fee') || 0);
  const num = (k: string) => { const n = Number(formData.get(k) || 0); return Number.isFinite(n) && n >= 0 ? n : 0; };
  const dtype = String(formData.get('discount_type') || 'amount') === 'percent' ? 'percent' : 'amount';
  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_restaurant_orders')
    .update({
      customer_name: String(formData.get('customer_name') || '').trim() || null,
      customer_phone: String(formData.get('customer_phone') || '').trim() || null,
      customer_address: String(formData.get('customer_address') || '').trim() || null,
      delivery_fee: Number.isFinite(fee) && fee >= 0 ? fee : 0,
      discount_type: dtype,
      discount_value: num('discount_value'),
      service_rate: num('service_rate'),
      tax_rate: num('tax_rate'),
      notes: String(formData.get('notes') || '').trim() || null,
    })
    .eq('id', id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidate(id);
  return { ok: true };
}

/** Checkout: totals, posts revenue, frees the table (atomic in the DB). */
export async function closeOrder(orderId: string, paymentMethod = 'cash'): Promise<ActionResult> {
  const { t } = await getT();
  const ctx = await requirePermission('restaurant.manage');
  const modErr = requireModuleAction(ctx, 'restaurant');
  if (modErr) return modErr;
  if (!ctx.companyId) return { ok: false, error: t('restaurant.actions.noCompany') };
  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_close_restaurant_order', {
    p_order_id: orderId,
    p_payment_method: paymentMethod === 'card' ? 'card' : 'cash',
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidate(orderId);
  return { ok: true };
}

export async function cancelOrder(orderId: string): Promise<ActionResult> {
  const { t } = await getT();
  const ctx = await requirePermission('restaurant.manage');
  const modErr = requireModuleAction(ctx, 'restaurant');
  if (modErr) return modErr;
  if (!ctx.companyId) return { ok: false, error: t('restaurant.actions.noCompany') };
  const supabase = await createClient();
  const { data: o } = await supabase.from('erp_restaurant_orders').select('table_id, status').eq('id', orderId).maybeSingle();
  const ord = o as { table_id: string | null; status: string } | null;
  if (ord?.status === 'closed') return { ok: false, error: t('restaurant.actions.cannotCancelClosed') };
  const { error } = await supabase.from('erp_restaurant_orders').update({ status: 'cancelled' }).eq('id', orderId);
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (ord?.table_id) await supabase.from('erp_restaurant_tables').update({ status: 'free' }).eq('id', ord.table_id);
  revalidate(orderId);
  return { ok: true };
}
