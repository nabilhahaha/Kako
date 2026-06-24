'use server';

// ============================================================================
// Field Verification → Setup → Customer Lists — admin actions (company admin only).
// Safely manage uploaded FV customer lists (datasets): archive / restore / replace
// (= archive-then-upload, handled in the UI) / delete-unverified-only.
//
// Archive is a SOFT state on erp_rp_datasets (status='archived'); reps stop seeing the
// list (Nearby / Assigned / Map filter archived datasets) but ALL completed history,
// photos, reports and audit remain. Delete-unverified routes through the SECURITY DEFINER
// erp_fv_delete_unverified RPC whose NOT EXISTS guard makes deleting a customer with any
// verification impossible. Company-scoped + field_verification.admin-gated; erp_rp_datasets
// RLS is the backstop.
// ============================================================================

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { logAudit } from '@/lib/erp/audit';
import {
  buildListRows, type FvCustomerList, type FvDatasetRow, type FvDatasetStat,
} from './fv-customer-lists';

type ResultD<T> = { ok: true; data: T } | { ok: false; error: string };

async function adminCtx() {
  const ctx = await getUserContext();
  if (!ctx?.companyId) return { err: 'err_unauthorized' as const, ctx: null };
  if (!hasPermission(ctx, 'field_verification.admin')) return { err: 'err_forbidden' as const, ctx: null };
  return { err: null, ctx };
}

/** True when the error means the 0372 schema (status column / RPCs) is not present in this
 *  environment's DB yet — so the UI can show a safe "pending database update" fallback instead
 *  of a hard error (e.g. code deployed before the guarded production migration was applied). */
function schemaMissing(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const code = err.code ?? '';
  const msg = (err.message ?? '').toLowerCase();
  return (
    code === '42703' ||           // undefined_column (status / archived_at)
    code === '42883' ||           // undefined_function (erp_fv_* RPCs)
    code === 'PGRST202' ||        // PostgREST: function not found
    code === 'PGRST204' ||        // PostgREST: column not found
    msg.includes('does not exist') ||
    msg.includes('schema cache')
  );
}

/** Sentinel error string the panel maps to the safe "pending migration" fallback. */
const PENDING = 'err_lists_pending_migration';

/** Owner display name lookup for the listed datasets. */
async function ownerNames(sb: Awaited<ReturnType<typeof createClient>>, ownerIds: string[]): Promise<Record<string, string | null>> {
  const ids = [...new Set(ownerIds.filter(Boolean))];
  if (ids.length === 0) return {};
  const { data } = await sb.from('erp_profiles').select('id, full_name').in('id', ids);
  const out: Record<string, string | null> = {};
  for (const p of data ?? []) out[p.id as string] = (p.full_name as string | null) ?? null;
  return out;
}

/** All FV customer lists for the company, with per-list counts + status. Admin only. */
export async function listFvCustomerLists(): Promise<ResultD<FvCustomerList[]>> {
  const { err, ctx } = await adminCtx();
  if (err) return { ok: false, error: err };
  const sb = await createClient();

  const { data: dsRows, error } = await sb.from('erp_rp_datasets')
    .select('id, name, created_at, owner_id, status, archived_at')
    .eq('company_id', ctx.companyId)
    .order('created_at', { ascending: false });
  if (error) return { ok: false, error: schemaMissing(error) ? PENDING : error.message };
  const datasets = (dsRows ?? []) as FvDatasetRow[];

  const { data: statRows, error: sErr } = await sb.rpc('erp_fv_dataset_stats');
  if (sErr) return { ok: false, error: schemaMissing(sErr) ? PENDING : sErr.message };
  const stats = (statRows ?? []) as FvDatasetStat[];

  const owners = await ownerNames(sb, datasets.map((d) => d.owner_id ?? ''));
  return { ok: true, data: buildListRows(datasets, stats, owners) };
}

/** Exact number of deletable (no-verification) customers in a list — drives the modal. */
export async function getUnverifiedCount(datasetId: string): Promise<ResultD<{ count: number }>> {
  const { err } = await adminCtx();
  if (err) return { ok: false, error: err };
  const sb = await createClient();
  const { data, error } = await sb.rpc('erp_fv_unverified_count', { p_dataset_id: datasetId });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { count: (data as number | null) ?? 0 } };
}

/** Archive a list — hide its customers from rep active work (Nearby/Assigned/Map). History kept. */
export async function archiveFvList(datasetId: string): Promise<ResultD<{ ok: true }>> {
  const { err, ctx } = await adminCtx();
  if (err) return { ok: false, error: err };
  const sb = await createClient();
  const { error } = await sb.from('erp_rp_datasets')
    .update({ status: 'archived', archived_at: new Date().toISOString(), archived_by: ctx.userId })
    .eq('id', datasetId).eq('company_id', ctx.companyId);
  if (error) return { ok: false, error: error.message };
  await logAudit(sb, { action: 'archive', entity: 'rp_dataset', entityId: datasetId, companyId: ctx.companyId });
  revalidatePath('/field-verification/setup');
  return { ok: true, data: { ok: true } };
}

/** Restore an archived list back into rep active work. */
export async function restoreFvList(datasetId: string): Promise<ResultD<{ ok: true }>> {
  const { err, ctx } = await adminCtx();
  if (err) return { ok: false, error: err };
  const sb = await createClient();
  const { error } = await sb.from('erp_rp_datasets')
    .update({ status: 'active', archived_at: null, archived_by: null })
    .eq('id', datasetId).eq('company_id', ctx.companyId);
  if (error) return { ok: false, error: error.message };
  await logAudit(sb, { action: 'restore', entity: 'rp_dataset', entityId: datasetId, companyId: ctx.companyId });
  revalidatePath('/field-verification/setup');
  return { ok: true, data: { ok: true } };
}

/** Delete ONLY customers with no verification in a list. Completed history/photos/reports are
 *  never touched (NOT EXISTS guard in the RPC). Returns the number actually deleted. */
export async function deleteUnverifiedFromList(datasetId: string): Promise<ResultD<{ deleted: number }>> {
  const { err, ctx } = await adminCtx();
  if (err) return { ok: false, error: err };
  const sb = await createClient();
  const { data, error } = await sb.rpc('erp_fv_delete_unverified', { p_dataset_id: datasetId });
  if (error) return { ok: false, error: error.message };
  const deleted = (data as number | null) ?? 0;
  await logAudit(sb, { action: 'delete_unverified', entity: 'rp_dataset', entityId: datasetId, companyId: ctx.companyId, details: { deleted } });
  revalidatePath('/field-verification/setup');
  return { ok: true, data: { deleted } };
}
