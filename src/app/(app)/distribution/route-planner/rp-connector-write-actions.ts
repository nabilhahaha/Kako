'use server';

// ============================================================================
// Phase D3 — Route Planner connector admin (NO-SECRET scope). Create / edit / status /
// run-sync for NON-SECRET data sources only:
//   * manual_upload   — no remote, no auth
//   * google_sheets   — PUBLIC sheet URL only (sheetCsvUrl restricts to docs.google.com;
//                       no token is ever accepted or stored)
// Secret-bearing connectors (api_erp / private sheets / Bearer tokens) are intentionally
// BLOCKED until a secure secret store exists. Nothing here writes config.token or any
// credential. Gated to admin/managerial; company-scoped; DB RLS is the backstop.
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { rpCanManageConnectors } from '@/lib/erp/route-planner-access';
import { sheetCsvUrl, fetchConnector } from '@/lib/erp/route-planner-connectors';

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
type ResultD<T> = { ok: true; data: T } | { ok: false; error: string };

const NON_SECRET_TYPES = ['manual_upload', 'google_sheets'] as const;
type NonSecretType = (typeof NON_SECRET_TYPES)[number];

async function ctxOrNull() {
  const ctx = await getUserContext();
  return ctx?.companyId ? ctx : null;
}
function canManage(ctx: NonNullable<Awaited<ReturnType<typeof getUserContext>>>): boolean {
  const isAdmin = ctx.isPlatformOwner || ctx.isSuperAdmin || ctx.topRole === 'admin';
  return rpCanManageConnectors(ctx.routePlannerAccess?.role ?? null, isAdmin);
}

export async function getMyConnectorPerms(): Promise<ResultD<{ canManage: boolean }>> {
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: 'err_unauthorized' };
  return { ok: true, data: { canManage: canManage(ctx) } };
}

/** Create a NON-SECRET data source. google_sheets requires a PUBLIC sheet URL (validated to
 *  docs.google.com); no token is accepted. api_erp / token connectors are rejected. */
export async function createConnector(input: { name: string; type: NonSecretType; sheetUrl?: string | null; schedule?: string | null }): Promise<ResultD<{ id: string }>> {
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: 'err_unauthorized' };
  if (!canManage(ctx)) return { ok: false, error: 'err_no_manage_perm' };
  const name = input.name?.trim();
  if (!name) return { ok: false, error: 'err_name_required' };
  if (!NON_SECRET_TYPES.includes(input.type)) return { ok: false, error: 'err_secret_type_blocked' };
  let config: Record<string, unknown> = {};
  if (input.type === 'google_sheets') {
    const url = (input.sheetUrl ?? '').trim();
    if (!sheetCsvUrl(url)) return { ok: false, error: 'err_bad_public_sheet_url' };
    config = { sheetUrl: url }; // PUBLIC url only — never a token/secret
  }
  const sb = await createClient();
  const { data, error } = await sb.from('erp_rp_data_sources').insert({
    company_id: ctx.companyId, created_by: ctx.userId, name, type: input.type,
    status: 'active', config, schedule: input.schedule?.trim() || null,
  }).select('id').single();
  if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' };
  return { ok: true, data: { id: data.id as string } };
}

/** Edit ONLY non-secret metadata: name / schedule / status (active|paused). config is never
 *  touched here, so no secret can be written through this path. */
export async function updateConnector(id: string, patch: { name?: string; schedule?: string | null; status?: 'active' | 'paused' }): Promise<Result> {
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: 'err_unauthorized' };
  if (!canManage(ctx)) return { ok: false, error: 'err_no_manage_perm' };
  const set: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) { const n = patch.name.trim(); if (!n) return { ok: false, error: 'err_name_required' }; set.name = n; }
  if (patch.schedule !== undefined) set.schedule = patch.schedule?.trim() || null;
  if (patch.status !== undefined) { if (patch.status !== 'active' && patch.status !== 'paused') return { ok: false, error: 'err_bad_status' }; set.status = patch.status; }
  const sb = await createClient();
  const { error } = await sb.from('erp_rp_data_sources').update(set).eq('id', id).eq('company_id', ctx.companyId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Run a sync for a NON-SECRET source: fetch the PUBLIC sheet (no auth) to validate
 *  connectivity + row count, then record a sync_run and update the source's last status.
 *  (Full column-mapped import into datasets is a later, separate phase.) */
export async function runSync(id: string): Promise<ResultD<{ rows: number }>> {
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: 'err_unauthorized' };
  if (!canManage(ctx)) return { ok: false, error: 'err_no_manage_perm' };
  const sb = await createClient();
  const { data: src, error: e1 } = await sb.from('erp_rp_data_sources')
    .select('name, type, config').eq('id', id).eq('company_id', ctx.companyId).maybeSingle();
  if (e1 || !src) return { ok: false, error: e1?.message ?? 'err_not_found' };
  if (src.type !== 'google_sheets') return { ok: false, error: 'err_sync_unsupported' };
  const sheetUrl = (src.config as Record<string, unknown> | null)?.sheetUrl as string | undefined;
  if (!sheetUrl || !sheetCsvUrl(sheetUrl)) return { ok: false, error: 'err_bad_public_sheet_url' };

  const { data: run } = await sb.from('erp_rp_sync_runs').insert({
    company_id: ctx.companyId, source_id: id, trigger: 'manual', status: 'running', source_label: src.name as string,
  }).select('id').single();
  const runId = run?.id as string | undefined;

  try {
    const sheet = await fetchConnector('google_sheets', { sheetUrl }); // PUBLIC fetch, no token
    const rows = sheet.rows.length;
    if (runId) await sb.from('erp_rp_sync_runs').update({ status: 'success', finished_at: new Date().toISOString(), rows_imported: rows }).eq('id', runId).eq('company_id', ctx.companyId);
    await sb.from('erp_rp_data_sources').update({ last_sync_at: new Date().toISOString(), last_status: 'success', updated_at: new Date().toISOString() }).eq('id', id).eq('company_id', ctx.companyId);
    return { ok: true, data: { rows } };
  } catch (e) {
    if (runId) await sb.from('erp_rp_sync_runs').update({ status: 'failed', finished_at: new Date().toISOString() }).eq('id', runId).eq('company_id', ctx.companyId);
    await sb.from('erp_rp_data_sources').update({ last_status: 'error', updated_at: new Date().toISOString() }).eq('id', id).eq('company_id', ctx.companyId);
    return { ok: false, error: e instanceof Error ? e.message : 'sync_failed' };
  }
}
