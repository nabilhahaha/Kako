'use server';

// ============================================================================
// FV-4a — Field Customer Verification ADMIN actions (Company Admin only).
//   * list the company's field reps for the assign picker
//   * read the assignment roster for a dataset (who is assigned, who is verified)
//   * bulk-assign / unassign customers to a rep (writes dataset_customers.salesman)
//
// The assignment key is dataset_customers.salesman = the rep's EMAIL (the same key the
// FV-2/FV-3 rep flow reads). Upload + City/Channel catalog reuse the existing pipeline
// (parseUploadColumns + persistDataset; getVerificationConfig) — no new schema. Every
// action is company-scoped + admin-gated here; erp_rp_dataset_customers RLS (rp_dsc_wr:
// platform owner / company admin / dataset owner) is the backstop.
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
type ResultD<T> = { ok: true; data: T } | { ok: false; error: string };

export interface VerificationRep { id: string; name: string; email: string }
export interface RosterRow {
  id: string; code: string | null; name: string;
  city: string | null; channel: string | null;
  assignedTo: string | null;   // salesman (rep email) or null
  verified: boolean;
}

function isCompanyAdmin(ctx: NonNullable<Awaited<ReturnType<typeof getUserContext>>>): boolean {
  return ctx.isPlatformOwner || ctx.isSuperAdmin || ctx.topRole === 'admin';
}
async function adminCtx() {
  const ctx = await getUserContext();
  if (!ctx?.companyId) return { err: 'err_unauthorized' as const, ctx: null };
  if (!isCompanyAdmin(ctx)) return { err: 'err_forbidden' as const, ctx: null };
  return { err: null, ctx };
}

/** Whether the current user is a company admin — drives showing the admin tab. */
export async function getVerificationAdminFlag(): Promise<ResultD<{ isAdmin: boolean }>> {
  const ctx = await getUserContext();
  if (!ctx?.companyId) return { ok: true, data: { isAdmin: false } };
  return { ok: true, data: { isAdmin: isCompanyAdmin(ctx) } };
}

/** Company field reps for the assign picker (id + name + email). Admin only. The email is
 *  the assignment key written to dataset_customers.salesman. */
export async function listVerificationReps(): Promise<ResultD<VerificationRep[]>> {
  const { err, ctx } = await adminCtx();
  if (err) return { ok: false, error: err };
  const sb = await createClient();
  const { data: branches } = await sb.from('erp_branches').select('id').eq('company_id', ctx.companyId);
  const branchIds = (branches ?? []).map((b) => b.id as string);
  if (branchIds.length === 0) return { ok: true, data: [] };
  const { data: ub } = await sb.from('erp_user_branches').select('user_id').in('branch_id', branchIds);
  const userIds = [...new Set((ub ?? []).map((r) => r.user_id as string))];
  if (userIds.length === 0) return { ok: true, data: [] };
  const { data: profiles, error } = await sb.from('erp_profiles').select('id, full_name, email').in('id', userIds);
  if (error) return { ok: false, error: error.message };
  const reps = (profiles ?? [])
    .map((p) => ({ id: p.id as string, name: (p.full_name as string) || (p.email as string) || (p.id as string), email: (p.email as string | null) ?? '' }))
    .filter((r) => r.email)   // assignment requires an email key
    .sort((a, b) => a.name.localeCompare(b.name));
  return { ok: true, data: reps };
}

/** The assignment roster for a dataset: each customer with its current assignment + whether
 *  it has already been verified. Admin only; company-scoped. */
export async function getAssignmentRoster(datasetId: string): Promise<ResultD<{ rows: RosterRow[]; total: number }>> {
  const { err, ctx } = await adminCtx();
  if (err) return { ok: false, error: err };
  if (!datasetId) return { ok: false, error: 'err_no_dataset' };
  const sb = await createClient();
  // Confirm the dataset is this company's (defence in depth over RLS).
  const { data: ds } = await sb.from('erp_rp_datasets').select('id').eq('id', datasetId).eq('company_id', ctx.companyId).maybeSingle();
  if (!ds) return { ok: false, error: 'err_dataset_not_found' };

  const { data, error, count } = await sb.from('erp_rp_dataset_customers')
    .select('id, code, name, city, channel, salesman', { count: 'exact' })
    .eq('dataset_id', datasetId).eq('company_id', ctx.companyId)
    .order('seq', { ascending: true }).range(0, 1999);
  if (error) return { ok: false, error: error.message };
  const custs = data ?? [];

  const ids = custs.map((c) => c.id as string);
  let verified = new Set<string>();
  if (ids.length) {
    const { data: vrows } = await sb.from('erp_rp_customer_verifications')
      .select('customer_id').eq('company_id', ctx.companyId).in('customer_id', ids);
    verified = new Set((vrows ?? []).map((v) => v.customer_id as string));
  }
  const rows: RosterRow[] = custs.map((c) => ({
    id: c.id as string, code: (c.code as string | null) ?? null, name: (c.name as string) ?? '',
    city: (c.city as string | null) ?? null, channel: (c.channel as string | null) ?? null,
    assignedTo: (c.salesman as string | null) ?? null, verified: verified.has(c.id as string),
  }));
  return { ok: true, data: { rows, total: count ?? rows.length } };
}

/** Bulk assign (or unassign when repEmail is null) customers to a rep. Writes
 *  dataset_customers.salesman. Admin only; company-scoped; rep must be a known company rep.
 *  Already-verified customers are skipped (their assignment is locked by the audit record). */
export async function assignCustomers(customerIds: string[], repEmail: string | null): Promise<ResultD<{ updated: number; skipped: number }>> {
  const { err, ctx } = await adminCtx();
  if (err) return { ok: false, error: err };
  const ids = [...new Set((customerIds ?? []).filter((x) => typeof x === 'string' && x))];
  if (ids.length === 0) return { ok: false, error: 'err_no_customers' };

  const email = repEmail?.trim() || null;
  if (email) {
    const reps = await listVerificationReps();
    if (!reps.ok) return reps;
    if (!reps.data.some((r) => r.email === email)) return { ok: false, error: 'err_unknown_rep' };
  }

  const sb = await createClient();
  // Don't reassign a customer that's already verified (its old/new snapshot is committed).
  const { data: vrows } = await sb.from('erp_rp_customer_verifications')
    .select('customer_id').eq('company_id', ctx.companyId).in('customer_id', ids);
  const locked = new Set((vrows ?? []).map((v) => v.customer_id as string));
  const target = ids.filter((id) => !locked.has(id));
  if (target.length === 0) return { ok: true, data: { updated: 0, skipped: ids.length } };

  const { data, error } = await sb.from('erp_rp_dataset_customers')
    .update({ salesman: email }).in('id', target).eq('company_id', ctx.companyId).select('id');
  if (error) return { ok: false, error: error.message };
  const updated = (data ?? []).length;
  return { ok: true, data: { updated, skipped: ids.length - updated } };
}
