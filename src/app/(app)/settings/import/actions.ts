'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import {
  getEntity, entityUniqueKey, entityDedupeKeys, entityRefFields, entityStamps,
  type EntityDescriptor, type ImportMode,
} from '@/lib/erp/entities';
import { getActiveCustomFields } from '@/lib/erp/custom-fields-server';
import { validateCustomValue, coerceCustomValue } from '@/lib/erp/custom-fields';
import { resolveRowRefs, type RefFieldDef } from '@/lib/erp/import-refs';
import { coerceFrequencyToken } from '@/lib/route-optimization/visit-frequency';

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
type RefMaps = Map<string, Map<string, string>>;

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

const TRUE_TOKENS = new Set(['true', '1', 'yes', 'y', 't', 'نعم', 'صح', 'مفعل']);
const FALSE_TOKENS = new Set(['false', '0', 'no', 'n', 'f', 'لا', 'خطأ', 'معطل']);
/** Coerce an import cell to boolean; returns undefined for blanks/unknowns so the
 *  column keeps its DB default rather than being forced. */
function parseBool(v: string): boolean | undefined {
  const t = v.trim().toLowerCase();
  if (TRUE_TOKENS.has(t)) return true;
  if (FALSE_TOKENS.has(t)) return false;
  return undefined;
}

const REF_QUERY_CHUNK = 400; // keep `.in(...)` lists well under URL/row limits

/**
 * Batch-resolve every `ref` field to a `loweredValue → id` map via the RLS-scoped
 * client (one query per ref field × match column, chunked for large files). The
 * maps feed both validation (flagging unresolved refs) and import (writing FKs).
 */
async function buildRefMaps(
  supabase: SupabaseClient,
  refFields: readonly RefFieldDef[],
  rows: readonly ImportRowInput[],
): Promise<RefMaps> {
  const maps: RefMaps = new Map();
  for (const rf of refFields) {
    const m = new Map<string, string>();
    // Distinct, non-empty original values to look up for this ref field.
    const distinct = [...new Set(rows.map((r) => (r[rf.key] ?? '').trim()).filter(Boolean))];
    if (distinct.length === 0) { maps.set(rf.key, m); continue; }
    for (const col of rf.ref.match) {
      for (let i = 0; i < distinct.length; i += REF_QUERY_CHUNK) {
        const chunk = distinct.slice(i, i + REF_QUERY_CHUNK);
        let query = supabase
          .from(rf.ref.table)
          .select(`id, ${col}`)
          .in(col, chunk);
        // Discriminated shared table (e.g. erp_customer_lookups by kind).
        for (const [fk, fv] of Object.entries(rf.ref.filter ?? {})) query = query.eq(fk, fv);
        const { data, error } = await query;
        if (error || !data) continue; // a missing optional match column shouldn't abort resolution
        for (const row of data as unknown as Record<string, unknown>[]) {
          const key = String(row[col] ?? '').trim().toLowerCase();
          if (key && !m.has(key)) m.set(key, String(row.id));
        }
      }
    }
    maps.set(rf.key, m);
  }
  return maps;
}

interface ValidationData { issues: RowIssue[]; errorRows: number; warningRows: number; validRows: number }

/** Pure-ish per-row validation given pre-built custom-field defs + ref maps.
 *  Classifies rows by severity; unresolved required refs are referential-integrity
 *  errors and block the row. */
function validateCore(
  entity: EntityDescriptor,
  rows: readonly ImportRowInput[],
  customDefs: Awaited<ReturnType<typeof getActiveCustomFields>>,
  refFields: readonly RefFieldDef[],
  refMaps: RefMaps,
): ValidationData {
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
      // FR-4: visit_frequency is free text but must coerce to a known cadence —
      // unrecognized values are imported as null (warning, never blocks the row).
      if (v && fld.key === 'visit_frequency' && !coerceFrequencyToken(v)) add('warning', `${fld.labelEn}: unrecognized frequency (ignored)`);
    }
    // Referential integrity: a provided ref value that doesn't resolve is an error.
    const { missing } = resolveRowRefs(r, refFields, refMaps);
    for (const m of missing) add('error', `${m.label} "${m.value}" not found`);
    // Custom fields (validated by their definitions; required even if unmapped).
    for (const cf of customDefs) {
      const msg = validateCustomValue(cf, r[cf.key]);
      if (msg) add('error', msg);
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
  return { issues, errorRows, warningRows, validRows };
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

  const supabase = await createClient();
  const customDefs = await getActiveCustomFields(entityKey);
  const refFields = entityRefFields(entity);
  const refMaps = await buildRefMaps(supabase, refFields, rows);
  const data = validateCore(entity, rows, customDefs, refFields, refMaps);
  return { ok: true, data };
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

  // Resolve FK refs once (shared by validation + payload building), then
  // re-validate server-side; never import error rows.
  const customDefs = await getActiveCustomFields(entityKey);
  const refFields = entityRefFields(entity);
  const refMaps = await buildRefMaps(supabase, refFields, rows);
  const validation = validateCore(entity, rows, customDefs, refFields, refMaps);
  const errorByRow = new Set(validation.issues.filter((i) => i.severity === 'error').map((i) => i.row));

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
  const booleanKeys = new Set(entity.fields.filter((f) => f.type === 'boolean').map((f) => f.key));
  // Resolvable `*_ref` keys are stripped from the raw payload and replaced by their
  // FK columns; non-spec `type:'ref'` fields keep their legacy raw-copy behaviour.
  const refKeys = new Set(refFields.map((f) => f.key));
  const stamps = entityStamps(entity);
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
      if (!allowed.has(k) || refKeys.has(k)) continue; // refs resolved separately
      const raw = (rows[i][k] ?? '').trim();
      if (raw === '') continue;
      if (k === 'visit_frequency') {
        // FR-4: coerce to a canonical token + stamp provenance. Unrecognized
        // values are dropped (left null) so we never store garbage; validation
        // already surfaced a warning. source='import' feeds the FR precedence.
        const tok = coerceFrequencyToken(raw);
        if (tok) { p.visit_frequency = tok; p.visit_frequency_source = 'import'; }
        continue;
      }
      if (numberKeys.has(k)) p[k] = Number(raw);
      else if (booleanKeys.has(k)) { const b = parseBool(raw); if (b !== undefined) p[k] = b; }
      else p[k] = raw;
    }
    // Merge resolved foreign keys (e.g. invoice_ref → invoice_id).
    const { fk } = resolveRowRefs(rows[i], refFields, refMaps);
    Object.assign(p, fk);
    // Custom field values → the entity row's `custom` jsonb bag (when supported).
    if (stamps.custom && customDefs.length > 0) {
      const customObj: Record<string, unknown> = {};
      for (const cf of customDefs) {
        const val = coerceCustomValue(cf, rows[i][cf.key]);
        if (val !== undefined) customObj[cf.key] = val;
      }
      if (Object.keys(customObj).length > 0) p.custom = customObj;
    }
    if (stamps.importJobId) p.import_job_id = jobId;

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
        if (stamps.updatedBy) p.updated_by = ctx.userId;
        if (stamps.updatedAt) p.updated_at = nowIso;
        const { error: upErr } = await supabase.from(entity.table).update(p).eq('id', existingId);
        if (upErr) runtime.push({ row: rowNo, severity: 'error', message: upErr.message });
        else success++;
      } else {
        if (mode === 'update') { skipped++; continue; }
        // insert / upsert / skip(new) → insert
        if (stamps.createdBy) p.created_by = ctx.userId;
        const { error: insErr } = await supabase.from(entity.table).insert(p);
        if (insErr) runtime.push({ row: rowNo, severity: 'error', message: insErr.message });
        else success++;
      }
    } catch (e) {
      runtime.push({ row: rowNo, severity: 'error', message: e instanceof Error ? e.message : 'insert failed' });
    }
  }

  const issues = [...validation.issues, ...runtime];
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
