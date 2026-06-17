'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { logAudit } from '@/lib/erp/audit';

/** Loyalty programme settings + ledger — tenant-configurable rates. */

export interface LoyaltySettings { earn_rate: number; redeem_rate: number; min_redeem: number }
export interface LoyaltyLedgerRow { id: string; customer: string | null; invoice_no: string | null; points: number; kind: string; created_at: string }

async function gate(): Promise<ActionResult<{ companyId: string; userId: string; perms: string[]; isSuper: boolean }>> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx || !ctx.companyId) return { ok: false, error: error ?? 'unauthorized' };
  const supabase = await createClient();
  const flags = await getFeatureFlags(supabase, ctx.companyId);
  if (flags['pharmacy.loyalty'] !== true) return { ok: false, error: 'feature_disabled' };
  return { ok: true, data: { companyId: ctx.companyId, userId: ctx.userId, perms: ctx.permissions as string[], isSuper: ctx.isSuperAdmin } };
}

export async function getLoyaltySettings(): Promise<LoyaltySettings> {
  const { ctx } = await requireAuth();
  if (!ctx?.companyId) return { earn_rate: 0, redeem_rate: 0, min_redeem: 0 };
  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_loyalty_settings').select('earn_rate, redeem_rate, min_redeem').eq('company_id', ctx.companyId).maybeSingle();
  const s = data as LoyaltySettings | null;
  return { earn_rate: Number(s?.earn_rate ?? 0), redeem_rate: Number(s?.redeem_rate ?? 0), min_redeem: Number(s?.min_redeem ?? 0) };
}

export async function setLoyaltySettings(input: LoyaltySettings): Promise<ActionResult> {
  const g = await gate();
  if (!g.ok || !g.data) return { ok: false, error: g.error };
  const { companyId, userId, perms, isSuper } = g.data;
  if (!(perms.includes('settings.users') || isSuper)) return { ok: false, error: 'no_permission' };
  const earn_rate = Math.max(0, Number(input.earn_rate) || 0);
  const redeem_rate = Math.max(0, Number(input.redeem_rate) || 0);
  const min_redeem = Math.max(0, Number(input.min_redeem) || 0);

  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_loyalty_settings')
    .upsert({ company_id: companyId, earn_rate, redeem_rate, min_redeem, updated_at: new Date().toISOString(), updated_by: userId },
      { onConflict: 'company_id' });
  if (error) return { ok: false, error: friendlyDbError(error) };
  await logAudit(supabase, {
    action: 'update', entity: 'loyalty_settings', entityId: companyId,
    details: { earn_rate, redeem_rate, min_redeem }, companyId,
  });
  revalidatePath('/pharmacy/loyalty');
  return { ok: true };
}

export async function recentLoyaltyLedger(): Promise<LoyaltyLedgerRow[]> {
  const g = await gate();
  if (!g.ok) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_loyalty_ledger')
    .select('id, invoice_no, points, kind, created_at, customer:erp_customers(name, name_ar)')
    .order('created_at', { ascending: false }).limit(50);
  type Row = { id: string; invoice_no: string | null; points: number; kind: string; created_at: string; customer: { name: string; name_ar: string | null } | null };
  return ((data as Row[] | null) ?? []).map((r) => ({
    id: r.id, invoice_no: r.invoice_no, points: Number(r.points), kind: r.kind,
    created_at: r.created_at, customer: r.customer?.name ?? null,
  }));
}
