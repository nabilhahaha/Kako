import 'server-only';
import type { createClient } from '@/lib/supabase/server';

/** ── Form effect handlers (B6) ──────────────────────────────────────────────
 *  What an APPROVED form submission DOES to the system, keyed by the form's
 *  `effect` jsonb. Whitelisted, safest-first set only:
 *    • record_only     — the submission itself is the record (no side effect)
 *    • update_field    — set one safe column on a target row (submission.record_id)
 *    • set_gps         — write a captured GPS point onto a target row
 *    • create_customer — provision a customer from mapped, non-financial fields
 *
 *  Higher-risk business effects (credit limits, pricing, financial actions) are
 *  intentionally NOT here — they belong to a later, higher-assurance phase.
 *
 *  Effects run through the RLS-bound server client AS THE ACTING USER (the
 *  approver on the workflow path, or the submitter on the auto-approve path), so
 *  they are permission-aware by construction. Every application is explicitly
 *  audited via erp_log_audit, independent of any per-table audit triggers. */

type Client = Awaited<ReturnType<typeof createClient>>;

export const WHITELISTED_EFFECTS = ['record_only', 'update_field', 'update_fields', 'set_gps', 'create_customer', 'emit_fact'] as const;
export type WhitelistedEffect = (typeof WHITELISTED_EFFECTS)[number];

// Safe, non-financial columns only. Financial / credit / pricing columns are
// deliberately excluded so a no-code form can never move money or limits.
const UPDATE_FIELD_ALLOW: Record<string, string[]> = {
  erp_customers: ['name', 'name_ar', 'phone', 'email', 'address', 'city', 'tax_number', 'latitude', 'longitude'],
};
const GPS_ALLOW: Record<string, [string, string]> = { erp_customers: ['latitude', 'longitude'] };
const CUSTOMER_CREATE_ALLOW = ['name', 'name_ar', 'phone', 'email', 'address', 'city', 'tax_number'];

interface Submission { id: string; company_id: string; form_id: string; record_id: string | null; values: Record<string, unknown>; }
interface Effect { type?: string; table?: string; column?: string; value_from?: string; map?: Record<string, string>; module?: string; event?: string; }
interface SubjectRef { entity?: string; source?: 'record' | 'field'; key?: string }

export interface EffectResult { applied: boolean; effect: string; recordId?: string | null; detail?: string; error?: string; }

function str(v: unknown): string | null { return v == null ? null : String(v); }

/** Resolve the subject row id a record-targeting effect should write to, using
 *  the form's declarative subject_ref. Mirrors erp_workflow_subject_customer so
 *  routing and effects always act on the same subject. Default = bound record. */
function resolveSubjectId(sub: Submission, ref: SubjectRef | null): string | null {
  const source = ref?.source ?? 'record';
  if (source === 'field') return str(sub.values[ref?.key ?? '']);
  if (source === 'record') return sub.record_id;
  return null;
}

async function audit(supabase: Client, sub: Submission, action: string, details: Record<string, unknown>) {
  // SECURITY DEFINER; never let an audit failure mask the effect outcome.
  try {
    await supabase.rpc('erp_log_audit', {
      p_action: action, p_entity: 'erp_form_submissions', p_entity_id: sub.id,
      p_details: details, p_company_id: sub.company_id,
    });
  } catch { /* best-effort */ }
}

/** Apply the form's effect for an APPROVED submission. Never throws — returns a
 *  result the caller can log. On create_customer the submission's record_id is
 *  back-filled with the new row id. */
export async function applyFormEffect(supabase: Client, submissionId: string): Promise<EffectResult> {
  const { data: subRow } = await supabase
    .from('erp_form_submissions')
    .select('id, company_id, form_id, record_id, values')
    .eq('id', submissionId)
    .single();
  const sub = subRow as Submission | null;
  if (!sub) return { applied: false, effect: 'unknown', error: 'submission not found' };

  const { data: defRow } = await supabase
    .from('erp_form_definitions')
    .select('effect, subject_ref')
    .eq('id', sub.form_id)
    .single();
  const def = (defRow as { effect: Effect; subject_ref: SubjectRef | null } | null);
  const effect = (def?.effect ?? { type: 'record_only' }) as Effect;
  const subjectRef = def?.subject_ref ?? null;
  const type = effect.type ?? 'record_only';

  if (!(WHITELISTED_EFFECTS as readonly string[]).includes(type)) {
    await audit(supabase, sub, 'form_effect_rejected', { type, reason: 'not_whitelisted' });
    return { applied: false, effect: type, error: 'effect not whitelisted' };
  }

  // ── record_only ──
  if (type === 'record_only') {
    await audit(supabase, sub, 'form_effect', { type });
    return { applied: true, effect: type, recordId: sub.record_id };
  }

  // ── update_field ──
  if (type === 'update_field') {
    const table = effect.table ?? '';
    const column = effect.column ?? '';
    const allowed = UPDATE_FIELD_ALLOW[table];
    if (!allowed || !allowed.includes(column)) {
      await audit(supabase, sub, 'form_effect_rejected', { type, table, column, reason: 'target_not_allowed' });
      return { applied: false, effect: type, error: 'target not allowed' };
    }
    const targetId = resolveSubjectId(sub, subjectRef);
    if (!targetId) {
      await audit(supabase, sub, 'form_effect_rejected', { type, reason: 'no_target_record' });
      return { applied: false, effect: type, error: 'no target record' };
    }
    const value = str(sub.values[effect.value_from ?? '']);
    const { error } = await supabase
      .from(table).update({ [column]: value }).eq('id', targetId).eq('company_id', sub.company_id);
    if (error) { await audit(supabase, sub, 'form_effect_failed', { type, table, column, error: error.message }); return { applied: false, effect: type, error: error.message }; }
    await audit(supabase, sub, 'form_effect', { type, table, column, record_id: targetId });
    return { applied: true, effect: type, recordId: targetId, detail: `${table}.${column}` };
  }

  // ── update_fields (multi-column) ──
  if (type === 'update_fields') {
    const table = effect.table ?? '';
    const allowed = UPDATE_FIELD_ALLOW[table];
    const map = effect.map ?? {};
    if (!allowed) {
      await audit(supabase, sub, 'form_effect_rejected', { type, table, reason: 'target_not_allowed' });
      return { applied: false, effect: type, error: 'target not allowed' };
    }
    const targetId = resolveSubjectId(sub, subjectRef);
    if (!targetId) {
      await audit(supabase, sub, 'form_effect_rejected', { type, reason: 'no_target_record' });
      return { applied: false, effect: type, error: 'no target record' };
    }
    const payload: Record<string, unknown> = {};
    for (const [col, fieldKey] of Object.entries(map)) {
      if (allowed.includes(col)) payload[col] = str(sub.values[fieldKey]);
    }
    if (Object.keys(payload).length === 0) {
      await audit(supabase, sub, 'form_effect_rejected', { type, table, reason: 'no_allowed_columns' });
      return { applied: false, effect: type, error: 'no allowed columns' };
    }
    const { error } = await supabase
      .from(table).update(payload).eq('id', targetId).eq('company_id', sub.company_id);
    if (error) { await audit(supabase, sub, 'form_effect_failed', { type, table, error: error.message }); return { applied: false, effect: type, error: error.message }; }
    await audit(supabase, sub, 'form_effect', { type, table, columns: Object.keys(payload), record_id: targetId });
    return { applied: true, effect: type, recordId: targetId, detail: `${table}:${Object.keys(payload).join(',')}` };
  }

  // ── set_gps ──
  if (type === 'set_gps') {
    const table = effect.table ?? '';
    const cols = GPS_ALLOW[table];
    if (!cols) {
      await audit(supabase, sub, 'form_effect_rejected', { type, table, reason: 'target_not_allowed' });
      return { applied: false, effect: type, error: 'target not allowed' };
    }
    const targetId = resolveSubjectId(sub, subjectRef);
    if (!targetId) {
      await audit(supabase, sub, 'form_effect_rejected', { type, reason: 'no_target_record' });
      return { applied: false, effect: type, error: 'no target record' };
    }
    const raw = str(sub.values[effect.value_from ?? '']) ?? '';
    const [latS, lngS] = raw.split(',');
    const lat = Number(latS), lng = Number(lngS);
    if (!latS || !lngS || Number.isNaN(lat) || Number.isNaN(lng)) {
      await audit(supabase, sub, 'form_effect_rejected', { type, reason: 'invalid_gps', raw });
      return { applied: false, effect: type, error: 'invalid GPS value' };
    }
    const [latCol, lngCol] = cols;
    const { error } = await supabase
      .from(table).update({ [latCol]: lat, [lngCol]: lng }).eq('id', targetId).eq('company_id', sub.company_id);
    if (error) { await audit(supabase, sub, 'form_effect_failed', { type, table, error: error.message }); return { applied: false, effect: type, error: error.message }; }
    await audit(supabase, sub, 'form_effect', { type, table, record_id: targetId, lat, lng });
    return { applied: true, effect: type, recordId: targetId, detail: `${lat},${lng}` };
  }

  // ── create_customer ──
  if (type === 'create_customer') {
    const map = effect.map ?? {};
    const row: Record<string, unknown> = { company_id: sub.company_id };
    for (const [col, fieldKey] of Object.entries(map)) {
      if (CUSTOMER_CREATE_ALLOW.includes(col)) row[col] = str(sub.values[fieldKey]);
    }
    if (!row.name || String(row.name).trim() === '') {
      await audit(supabase, sub, 'form_effect_rejected', { type, reason: 'name_required' });
      return { applied: false, effect: type, error: 'customer name required' };
    }
    // Customers created via a form land unapproved (sellable only after the
    // company's own customer-approval flow), and get a generated unique code.
    row.code = `FRM-${Date.now().toString(36).toUpperCase()}`;
    row.is_approved = false;
    const { data: created, error } = await supabase
      .from('erp_customers').insert(row).select('id').single();
    if (error) { await audit(supabase, sub, 'form_effect_failed', { type, error: error.message }); return { applied: false, effect: type, error: error.message }; }
    const newId = (created as { id: string }).id;
    await supabase.from('erp_form_submissions').update({ record_id: newId }).eq('id', sub.id);
    await audit(supabase, sub, 'form_effect', { type, customer_id: newId });
    return { applied: true, effect: type, recordId: newId, detail: 'erp_customers' };
  }

  // ── emit_fact (analytics: append a raw fact) ──
  if (type === 'emit_fact') {
    const event = (effect.event ?? '').trim();
    if (!event) {
      await audit(supabase, sub, 'form_effect_rejected', { type, reason: 'no_event' });
      return { applied: false, effect: type, error: 'no event' };
    }
    // Build the fact from mapped measures + dimensions. erp_raw_emit maps known
    // keys to columns (amount, quantity, currency, gps_lat/lng, geofence_result,
    // route_id, …) and folds the rest into details. customer_id = subject.
    const fact: Record<string, unknown> = { company_id: sub.company_id };
    const subjectId = resolveSubjectId(sub, subjectRef);
    if (subjectId) fact.customer_id = subjectId;
    for (const [factKey, fieldKey] of Object.entries(effect.map ?? {})) {
      const v = str(sub.values[fieldKey]);
      if (v != null) fact[factKey] = v;
    }
    const { error } = await supabase.rpc('erp_raw_emit', {
      p_module: (effect.module ?? 'field_ops').trim() || 'field_ops', p_event_type: event, p_fact: fact,
    });
    if (error) { await audit(supabase, sub, 'form_effect_failed', { type, event, error: error.message }); return { applied: false, effect: type, error: error.message }; }
    await audit(supabase, sub, 'form_effect', { type, event, customer_id: subjectId ?? null });
    return { applied: true, effect: type, recordId: subjectId ?? sub.record_id, detail: event };
  }

  return { applied: false, effect: type, error: 'unhandled effect' };
}
