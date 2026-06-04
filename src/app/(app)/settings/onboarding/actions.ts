'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { getEntity } from '@/lib/erp/entities';
import { rollbackEligibility, isRollbackMarker } from '@/lib/erp/import-rollback';

/** ── Customer Onboarding — server actions ──────────────────────────────────
 *  Reverses an import job by deleting every row stamped with its `import_job_id`
 *  and recording a rollback marker in the job's error_log (jsonb; the status
 *  CHECK constraint forbids a custom status). RLS scopes the delete to the
 *  tenant; only reversible entities (those that stamp import_job_id) are allowed.
 *  No new tables. */

interface Result<T = unknown> { ok: boolean; error?: string; data?: T }

async function guard() {
  const ctx = await getUserContext();
  if (!ctx) return { ctx: null, error: 'unauthorized' as const };
  if (!hasPermission(ctx, 'integrations.manage')) return { ctx: null, error: 'unauthorized' as const };
  return { ctx, error: null };
}

export async function rollbackImportJob(jobId: string): Promise<Result<{ deleted: number }>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  if (!jobId) return { ok: false, error: 'missing job' };

  const supabase = await createClient();

  // Load the job (RLS-scoped); need entity + current error_log.
  const { data: job, error: jErr } = await supabase
    .from('erp_import_jobs')
    .select('id, target_entity, status, error_log')
    .eq('id', jobId)
    .maybeSingle();
  if (jErr) return { ok: false, error: jErr.message };
  if (!job) return { ok: false, error: 'job not found' };

  const j = job as { id: string; target_entity: string | null; status: string | null; error_log: unknown };
  const elig = rollbackEligibility(j.target_entity);
  if (!elig.eligible) return { ok: false, error: `not reversible: ${elig.reason}` };

  const log = Array.isArray(j.error_log) ? j.error_log : [];
  if (log.some(isRollbackMarker)) return { ok: false, error: 'already rolled back' };

  const entity = getEntity(j.target_entity!)!; // eligibility guarantees a known entity

  // Delete the rows this job wrote (scoped by import_job_id + RLS company scope).
  const { data: deletedRows, error: dErr } = await supabase
    .from(entity.table)
    .delete()
    .eq('import_job_id', jobId)
    .select('id');
  if (dErr) return { ok: false, error: dErr.message };
  const deleted = (deletedRows as { id: string }[] | null)?.length ?? 0;

  // Record the rollback in the audit (marker + reset success count).
  const marker = { __rollback: { at: new Date().toISOString(), deleted } };
  const { error: uErr } = await supabase
    .from('erp_import_jobs')
    .update({ error_log: [...log, marker], success_rows: 0 })
    .eq('id', jobId);
  if (uErr) return { ok: false, error: uErr.message };

  revalidatePath('/settings/onboarding/rollback');
  revalidatePath('/settings/onboarding');
  return { ok: true, data: { deleted } };
}
