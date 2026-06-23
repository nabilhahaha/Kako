'use server';

// ============================================================================
// FV-4d — admin-managed City/Channel catalog. City and Channel are company-admin-defined
// dropdown lists (erp_rp_verification_catalog, migration 0369) — NOT derived from uploaded
// data and never free-typed. Field users read ACTIVE values; only the Company Admin writes.
// Company-scoped + admin-gated here; the catalog RLS is the backstop.
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
type ResultD<T> = { ok: true; data: T } | { ok: false; error: string };

export type CatalogKind = 'city' | 'channel';
export interface CatalogEntry { id: string; kind: CatalogKind; value: string; sortOrder: number; active: boolean }

function isCompanyAdmin(ctx: NonNullable<Awaited<ReturnType<typeof getUserContext>>>): boolean {
  return ctx.isPlatformOwner || ctx.isSuperAdmin || ctx.topRole === 'admin';
}
async function adminCtx() {
  const ctx = await getUserContext();
  if (!ctx?.companyId) return { err: 'err_unauthorized' as const, ctx: null };
  if (!isCompanyAdmin(ctx)) return { err: 'err_forbidden' as const, ctx: null };
  return { err: null, ctx };
}
const cleanKind = (k: unknown): CatalogKind | null => (k === 'city' || k === 'channel' ? k : null);

/** ACTIVE catalog values for the company, for the rep dropdowns + server validation. Any
 *  company member may read. Returns sorted-by-sort_order distinct values per kind. */
export async function getActiveCatalog(): Promise<ResultD<{ cities: string[]; channels: string[] }>> {
  const ctx = await getUserContext();
  if (!ctx?.companyId) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { data, error } = await sb.from('erp_rp_verification_catalog')
    .select('kind, value, sort_order').eq('company_id', ctx.companyId).eq('active', true)
    .order('sort_order', { ascending: true }).order('value', { ascending: true });
  if (error) return { ok: false, error: error.message };
  const pick = (k: CatalogKind) => (data ?? []).filter((r) => r.kind === k).map((r) => r.value as string);
  return { ok: true, data: { cities: pick('city'), channels: pick('channel') } };
}

/** Full catalog (active + inactive) for the admin manager, grouped by kind. Admin only. */
export async function listCatalog(): Promise<ResultD<{ city: CatalogEntry[]; channel: CatalogEntry[] }>> {
  const { err, ctx } = await adminCtx();
  if (err) return { ok: false, error: err };
  const sb = await createClient();
  const { data, error } = await sb.from('erp_rp_verification_catalog')
    .select('id, kind, value, sort_order, active').eq('company_id', ctx.companyId)
    .order('kind', { ascending: true }).order('sort_order', { ascending: true }).order('value', { ascending: true });
  if (error) return { ok: false, error: error.message };
  const map = (r: Record<string, unknown>): CatalogEntry => ({
    id: r.id as string, kind: r.kind as CatalogKind, value: r.value as string,
    sortOrder: (r.sort_order as number) ?? 0, active: Boolean(r.active),
  });
  const rows = (data ?? []).map(map);
  return { ok: true, data: { city: rows.filter((r) => r.kind === 'city'), channel: rows.filter((r) => r.kind === 'channel') } };
}

/** Add a value to a kind. Admin only. sort_order = current max + 1. Idempotent on the
 *  UNIQUE(company_id, kind, value): a duplicate is reported, not silently re-added. */
export async function addCatalogValue(kind: CatalogKind, value: string): Promise<Result> {
  const { err, ctx } = await adminCtx();
  if (err) return { ok: false, error: err };
  const k = cleanKind(kind); if (!k) return { ok: false, error: 'err_bad_kind' };
  const v = value?.trim(); if (!v) return { ok: false, error: 'err_value_required' };
  const sb = await createClient();
  const { data: top } = await sb.from('erp_rp_verification_catalog')
    .select('sort_order').eq('company_id', ctx.companyId).eq('kind', k)
    .order('sort_order', { ascending: false }).limit(1).maybeSingle();
  const nextSort = ((top?.sort_order as number | null) ?? 0) + 1;
  const { error } = await sb.from('erp_rp_verification_catalog').insert({
    company_id: ctx.companyId, kind: k, value: v, sort_order: nextSort, active: true, updated_by: ctx.userId,
  });
  if (error) return { ok: false, error: error.code === '23505' ? 'err_duplicate' : error.message };
  return { ok: true };
}

/** Rename a value. Admin only. */
export async function renameCatalogValue(id: string, value: string): Promise<Result> {
  const { err, ctx } = await adminCtx();
  if (err) return { ok: false, error: err };
  const v = value?.trim(); if (!v) return { ok: false, error: 'err_value_required' };
  const sb = await createClient();
  const { error } = await sb.from('erp_rp_verification_catalog')
    .update({ value: v, updated_by: ctx.userId, updated_at: new Date().toISOString() })
    .eq('id', id).eq('company_id', ctx.companyId);
  if (error) return { ok: false, error: error.code === '23505' ? 'err_duplicate' : error.message };
  return { ok: true };
}

/** Activate / deactivate a value (soft enable/disable for the dropdowns). Admin only. */
export async function setCatalogActive(id: string, active: boolean): Promise<Result> {
  const { err, ctx } = await adminCtx();
  if (err) return { ok: false, error: err };
  const sb = await createClient();
  const { error } = await sb.from('erp_rp_verification_catalog')
    .update({ active: !!active, updated_by: ctx.userId, updated_at: new Date().toISOString() })
    .eq('id', id).eq('company_id', ctx.companyId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Remove a value. Admin only. History is unaffected — verifications store the text, not a FK. */
export async function deleteCatalogValue(id: string): Promise<Result> {
  const { err, ctx } = await adminCtx();
  if (err) return { ok: false, error: err };
  const sb = await createClient();
  const { error } = await sb.from('erp_rp_verification_catalog').delete().eq('id', id).eq('company_id', ctx.companyId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
