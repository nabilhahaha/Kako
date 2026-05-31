'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { getEntity, entityUniqueKey, entityDedupeKeys, type ImportMode } from '@/lib/erp/entities';

/** ── Import Engine: generic, registry-driven, entity-based ─────────────────
 *  One pipeline for every registered entity. Validation classifies rows as
 *  error / warning / info — import proceeds with warnings but NEVER with errors.
 *  Modes: insert / update / upsert / skip (by the entity's unique key). Every
 *  written record is stamped (import_job_id, created_by/updated_by, external_id)
 *  for full auditability. RLS scopes all writes to the caller's company. */

export interface ImportRowInput { [field: string]: string }
export type Severity = 'error' | 'warning' | 'info';
export interface RowIssue { row: number; severity: Severity; message: string }
interface Result<T = unknown> { ok: boolean; error?: string; data?: T }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function guard() {
  const ctx = await getUserContext();
  if (!ctx) return { ctx: null, error: 'unauthorized' as const };
  if (!hasPermission(ctx, 'integrations.manage')) return { ctx: null, error: 'unauthorized' as const };
  return { ctx, error: null };
}

/** Validate rows against the entity descriptor. Returns issues classified by
 *  severity + the rows that have NO errors (warnings are still importable). */
export async function validateImport(
  entityKey: string,
  rows: ImportRowInput[],
): Promise<Result<{ issues: RowIssue[]; errorRows: number; warningRows: number; validRows: number }>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const entity = getEntity(entityKey);
  if (!entity || !entity.fields) return { ok: false, error: 'unknown entity' };

  const issues: RowIssue[] = [];
  const seen = new Map<string, number>();
  const dedupe = entityDedupeKeys(entity);
  let errorRows = 0, warningRows = 0;

  rows.forEach((r, i) => {
    const rowNo = i + 1;
    let hasError = false, hasWarning = false;
    const add = (sev: Severity, msg: string) => {
      issues.push({ row: rowNo, severity: sev, message: msg });
      if (sev === 'error') hasError = true; else if (sev === 'warning') hasWarning = true;
    };

    for (const fld of entity.fields!) {
      const v = (r[fld.key] ?? '').trim();
      const sev: Severity = fld.severity ?? 'error';
      if (fld.required && !v) add('error', `${fld.labelEn} is required`);
      if (v && fld.type === 'email' && !EMAIL_RE.test(v)) add(sev === 'error' ? 'warning' : sev, 'invalid email');
      if (v && fld.type === 'number' && isNaN(Number(v))) add('error', `${fld.labelEn}: invalid number`);
      if (v && fld.type === 'date' && isNaN(Date.parse(v))) add('warning', `${fld.labelEn}: invalid date`);
    }
    // Duplicate-within-file detection on the dedupe keys.
    const dk = dedupe.map((k) => (r[k] ?? '').trim().toLowerCase()).filter(Boolean).join('|');
    if (dk) {
      if (seen.has(dk)) add('warning', `duplicate of row ${seen.get(dk)} in file`);
      else seen.set(dk, rowNo);
    }

    if (hasError) errorRows++; else if (hasWarning) warningRows++;
  });

  const validRows = rows.length - errorRows;
  return { ok: true, data: { issues, errorRows, warningRows, validRows } };
}

/** Run the import. Rows with errors are skipped; warnings are imported. The
 *  `mode` controls existing-record handling (matched by the entity unique key).
 *  Records the job (summary + validation/error report) in import history. */
export async function runImport(
  entityKey: string,
  fileName: string,
  mapping: Record<string, string>,
  rows: ImportRowInput[],
  mode: ImportMode = 'insert',
): Promise<Result<{ jobId: string; total: number; success: number; failed: number; skipped: number; issues: RowIssue[] }>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const entity = getEntity(entityKey);
  if (!entity || !entity.fields) return { ok: false, error: 'unknown entity' };

  const supabase = await createClient();

  // Re-validate server-side; never import error rows.
  const v = await validateImport(entityKey, rows);
  if (!v.ok || !v.data) return { ok: false, error: v.error ?? 'validation failed' };
  const errorByRow = new Set(v.data.issues.filter((i) => i.severity === 'error').map((i) => i.row));

  // Create the job first so every written record can reference import_job_id.
  const { data: job, error: jobErr } = await supabase
    .from('erp_import_jobs')
    .insert({
      target_entity: entityKey, file_name: fileName, mapping,
      status: 'importing', total_rows: rows.length, created_by: ctx.userId,
    })
    .select('id').single();
  if (jobErr || !job) return { ok: false, error: jobErr?.message ?? 'could not create job' };
  const jobId = (job as { id: string }).id;

  const allowed = new Set(entity.fields.map((f) => f.key));
  const numberKeys = new Set(entity.fields.filter((f) => f.type === 'number').map((f) => f.key));
  const uniqueKey = entityUniqueKey(entity);
  const nowIso = new Date().toISOString();

  let success = 0, skipped = 0;
  const runtime: RowIssue[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNo = i + 1;
    if (errorByRow.has(rowNo)) { continue; } // never import error rows

    // Build the payload from the descriptor only.
    const p: Record<string, unknown> = {};
    for (const k of Object.keys(rows[i])) {
      if (!allowed.has(k)) continue;
      const raw = (rows[i][k] ?? '').trim();
      if (raw === '') continue;
      p[k] = numberKeys.has(k) ? Number(raw) : raw;
    }
    p.import_job_id = jobId;

    // Does a record already exist (by unique key in this company)?
    let existingId: string | null = null;
    const ukVal = uniqueKey ? String(p[uniqueKey] ?? '').trim() : '';
    if (uniqueKey && ukVal) {
      const { data: ex } = await supabase.from(entity.table).select('id').eq(uniqueKey, ukVal).maybeSingle();
      existingId = (ex as { id: string } | null)?.id ?? null;
    }

    try {
      if (existingId) {
        if (mode === 'insert' || mode === 'skip') { skipped++; continue; }
        // update / upsert → update the existing row
        p.updated_by = ctx.userId; p.updated_at = nowIso;
        const { error: upErr } = await supabase.from(entity.table).update(p).eq('id', existingId);
        if (upErr) runtime.push({ row: rowNo, severity: 'error', message: upErr.message });
        else success++;
      } else {
        if (mode === 'update') { skipped++; continue; }
        // insert / upsert / skip(new) → insert
        p.created_by = ctx.userId;
        const { error: insErr } = await supabase.from(entity.table).insert(p);
        if (insErr) runtime.push({ row: rowNo, severity: 'error', message: insErr.message });
        else success++;
      }
    } catch (e) {
      runtime.push({ row: rowNo, severity: 'error', message: e instanceof Error ? e.message : 'insert failed' });
    }
  }

  const issues = [...v.data.issues, ...runtime];
  const failed = errorByRow.size + runtime.length;

  await supabase.from('erp_import_jobs').update({
    status: success > 0 ? 'completed' : 'failed',
    success_rows: success, failed_rows: failed,
    error_log: issues,
    completed_at: nowIso,
  }).eq('id', jobId);

  revalidatePath('/settings/import');
  return { ok: true, data: { jobId, total: rows.length, success, failed, skipped, issues } };
}
