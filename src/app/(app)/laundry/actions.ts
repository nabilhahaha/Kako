'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requirePermission, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { getT } from '@/lib/i18n/server';

// Laundry: a price list + customer orders with a wash workflow
// (received → washing → ready → delivered) and checkout to accounting.

function revalidate(orderId?: string) {
  revalidatePath('/laundry');
  revalidatePath('/laundry/orders');
  if (orderId) revalidatePath(`/laundry/orders/${orderId}`);
}

export async function upsertService(formData: FormData): Promise<ActionResult> {
  const ctx = await requirePermission('laundry.manage');
  const { t } = await getT();
  if (!ctx.companyId) return { ok: false, error: t('laundry.errors.noCompany') };
  const id = String(formData.get('id') || '').trim();
  const name = String(formData.get('name') || '').trim();
  if (!name) return { ok: false, error: t('laundry.errors.serviceNameRequired') };
  const price = Number(formData.get('price') || 0);
  const row = { name, price: Number.isFinite(price) && price >= 0 ? price : 0, is_active: String(formData.get('is_active') || 'true') !== 'false' };
  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from('erp_laundry_services').update(row).eq('id', id);
    if (error) return { ok: false, error: friendlyDbError(error) };
  } else {
    const { error } = await supabase.from('erp_laundry_services').insert({ ...row, company_id: ctx.companyId });
    if (error) return { ok: false, error: friendlyDbError(error) };
  }
  revalidatePath('/laundry/services');
  return { ok: true };
}

export async function createOrder(input: { customer_name?: string; customer_phone?: string; customer_address?: string; is_delivery?: boolean }): Promise<ActionResult<string>> {
  const ctx = await requirePermission('laundry.manage');
  const { t } = await getT();
  if (!ctx.companyId) return { ok: false, error: t('laundry.errors.noCompany') };
  const supabase = await createClient();
  const { data, error } = await supabase.from('erp_laundry_orders').insert({
    company_id: ctx.companyId,
    customer_name: input.customer_name?.trim() || null,
    customer_phone: input.customer_phone?.trim() || null,
    customer_address: input.customer_address?.trim() || null,
    is_delivery: !!input.is_delivery,
    status: 'received', created_by: ctx.userId,
  }).select('id').single();
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidate();
  return { ok: true, data: (data as { id: string }).id };
}

export async function addOrderItem(orderId: string, serviceId: string): Promise<ActionResult> {
  const ctx = await requirePermission('laundry.manage');
  const { t } = await getT();
  if (!ctx.companyId) return { ok: false, error: t('laundry.errors.noCompany') };
  const supabase = await createClient();
  const { data: s } = await supabase.from('erp_laundry_services').select('name, price').eq('id', serviceId).maybeSingle();
  const svc = s as { name: string; price: number } | null;
  if (!svc) return { ok: false, error: t('laundry.errors.serviceNotFound') };
  const { data: existing } = await supabase.from('erp_laundry_order_items').select('id, qty').eq('order_id', orderId).eq('service_id', serviceId).maybeSingle();
  if (existing?.id) {
    const { error } = await supabase.from('erp_laundry_order_items').update({ qty: Number((existing as { qty: number }).qty) + 1 }).eq('id', existing.id);
    if (error) return { ok: false, error: friendlyDbError(error) };
  } else {
    const { error } = await supabase.from('erp_laundry_order_items').insert({ company_id: ctx.companyId, order_id: orderId, service_id: serviceId, name: svc.name, price: Number(svc.price || 0), qty: 1 });
    if (error) return { ok: false, error: friendlyDbError(error) };
  }
  revalidate(orderId);
  return { ok: true };
}

export async function setItemQty(itemId: string, qty: number, orderId: string): Promise<ActionResult> {
  const ctx = await requirePermission('laundry.manage');
  const { t } = await getT();
  if (!ctx.companyId) return { ok: false, error: t('laundry.errors.noCompany') };
  const supabase = await createClient();
  if (qty <= 0) {
    const { error } = await supabase.from('erp_laundry_order_items').delete().eq('id', itemId);
    if (error) return { ok: false, error: friendlyDbError(error) };
  } else {
    const { error } = await supabase.from('erp_laundry_order_items').update({ qty: Math.round(qty) }).eq('id', itemId);
    if (error) return { ok: false, error: friendlyDbError(error) };
  }
  revalidate(orderId);
  return { ok: true };
}

export async function updateOrderMeta(formData: FormData): Promise<ActionResult> {
  const ctx = await requirePermission('laundry.manage');
  const { t } = await getT();
  if (!ctx.companyId) return { ok: false, error: t('laundry.errors.noCompany') };
  const id = String(formData.get('id') || '').trim();
  if (!id) return { ok: false, error: t('laundry.errors.orderRequired') };
  const fee = Number(formData.get('delivery_fee') || 0);
  const disc = Number(formData.get('discount_value') || 0);
  const due = String(formData.get('due_date') || '').trim();
  const supabase = await createClient();
  const { error } = await supabase.from('erp_laundry_orders').update({
    customer_name: String(formData.get('customer_name') || '').trim() || null,
    customer_phone: String(formData.get('customer_phone') || '').trim() || null,
    customer_address: String(formData.get('customer_address') || '').trim() || null,
    is_delivery: String(formData.get('is_delivery') || '') === 'on' || String(formData.get('is_delivery') || '') === 'true',
    delivery_fee: Number.isFinite(fee) && fee >= 0 ? fee : 0,
    discount_value: Number.isFinite(disc) && disc >= 0 ? disc : 0,
    due_date: due || null,
    notes: String(formData.get('notes') || '').trim() || null,
  }).eq('id', id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidate(id);
  return { ok: true };
}

export async function setOrderStatus(orderId: string, status: string): Promise<ActionResult> {
  const ctx = await requirePermission('laundry.manage');
  const { t } = await getT();
  if (!ctx.companyId) return { ok: false, error: t('laundry.errors.noCompany') };
  if (!['received', 'washing', 'ready'].includes(status)) return { ok: false, error: t('laundry.errors.invalidStatus') };
  const supabase = await createClient();
  const { error } = await supabase.from('erp_laundry_orders').update({ status }).eq('id', orderId);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidate(orderId);
  return { ok: true };
}

export async function closeOrder(orderId: string, paymentMethod = 'cash'): Promise<ActionResult> {
  const ctx = await requirePermission('laundry.manage');
  const { t } = await getT();
  if (!ctx.companyId) return { ok: false, error: t('laundry.errors.noCompany') };
  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_close_laundry_order', { p_order_id: orderId, p_payment_method: paymentMethod === 'card' ? 'card' : 'cash' });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidate(orderId);
  return { ok: true };
}

export async function cancelOrder(orderId: string): Promise<ActionResult> {
  const ctx = await requirePermission('laundry.manage');
  const { t } = await getT();
  if (!ctx.companyId) return { ok: false, error: t('laundry.errors.noCompany') };
  const supabase = await createClient();
  const { data: o } = await supabase.from('erp_laundry_orders').select('status').eq('id', orderId).maybeSingle();
  if ((o as { status: string } | null)?.status === 'delivered') return { ok: false, error: t('laundry.errors.cannotCancelDelivered') };
  const { error } = await supabase.from('erp_laundry_orders').update({ status: 'cancelled' }).eq('id', orderId);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidate(orderId);
  return { ok: true };
}
