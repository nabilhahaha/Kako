'use server';

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { loadGovernanceInputs } from '@/lib/erp/field-governance-server';
import { resolveLayout, type AccessLevel } from '@/lib/erp/field-governance';
import { getEntity } from '@/lib/erp/entities';
import { resolveFormOptions } from '@/lib/form-builder/options-server';
import {
  FORM_BUILDER_ENABLED,
  allFields,
  validateFormResponse,
  validateGovernedResponse,
  applyFormGovernance,
  scoreFormResponse,
  type FormDefinition,
  type FormAnswers,
  type SubmitFormInput,
  type SubmitFormResult,
} from '@/lib/form-builder';

/** Load the prior (before) values of the governed, entity-backed fields, so the
 *  immutable response carries a before/after audit delta for the approver. Only
 *  columns that exist on the entity registry are read (no arbitrary select). */
async function loadBeforeSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  entity: string,
  recordId: string,
  boundKeys: string[],
): Promise<Record<string, unknown> | null> {
  const desc = getEntity(entity);
  if (!desc?.table) return null;
  const safeCols = boundKeys.filter((k) => (desc.fields ?? []).some((f) => f.key === k));
  if (safeCols.length === 0) return null;
  const { data } = await supabase.from(desc.table).select(safeCols.join(',')).eq('id', recordId).maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

/** ── Form Builder (8F-2) — response submission (server) ─────────────────────
 *  The SINGLE write path for a form response, reused by the online renderer AND
 *  the offline-sync intake handler (no forked logic). Loads the latest PUBLISHED
 *  version, resolves the bound entity's layout through the one field-governance
 *  path, strips ungovernable values + enforces required, scores, and inserts an
 *  IMMUTABLE response (RLS-scoped to the company). */
export async function submitFormResponse(input: SubmitFormInput): Promise<SubmitFormResult> {
  if (!FORM_BUILDER_ENABLED()) return { ok: false, error: 'disabled' };

  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: 'unauthorized' };
  if (!ctx.companyId) return { ok: false, error: 'no company' };
  // Submitting a data-update / field form: field reps or customer managers.
  if (!hasPermission(ctx, 'field.sales') && !hasPermission(ctx, 'customers.manage') && !hasPermission(ctx, 'survey.manage')) {
    return { ok: false, error: 'unauthorized' };
  }
  if (!input.formId && !input.formCode) return { ok: false, error: 'missing form' };

  const supabase = await createClient();

  // Resolve the form (company-owned or a readable global template).
  let formQ = supabase.from('erp_forms').select('id, entity, is_active').eq('is_active', true);
  formQ = input.formId ? formQ.eq('id', input.formId) : formQ.eq('code', input.formCode!);
  const { data: form, error: formErr } = await formQ.maybeSingle();
  if (formErr) return { ok: false, error: formErr.message };
  if (!form) return { ok: false, error: 'form not found' };
  const formRow = form as { id: string; entity: string | null };
  const entity = input.entity ?? formRow.entity ?? null;

  // Latest PUBLISHED version — responses always bind to a published schema.
  const { data: ver, error: verErr } = await supabase
    .from('erp_form_versions')
    .select('version, schema')
    .eq('form_id', formRow.id)
    .eq('status', 'published')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (verErr) return { ok: false, error: verErr.message };
  if (!ver) return { ok: false, error: 'no published version' };
  const verRow = ver as { version: number; schema: FormDefinition };
  // Resolve dynamic master-data options (per tenant) so select validation runs
  // against the same live set the renderer showed — the single options path.
  const def = await resolveFormOptions(supabase, (verRow.schema ?? { sections: [] }) as FormDefinition);

  // Governance: resolve the bound entity's field layout for this user + record
  // through the SINGLE path. No entity → empty map → every field 'edit'.
  let gov = new Map<string, AccessLevel>();
  if (entity) {
    const inputs = await loadGovernanceInputs(supabase, ctx, entity);
    gov = resolveLayout(inputs, { id: input.recordId ?? null, ...input.answers });
  }

  // Validate (definition type/option checks + governed required/visibility), then
  // build the SAFE answers (hidden/read-only values dropped — never persisted).
  const problems = [
    ...new Set([
      ...validateFormResponse(def, input.answers),
      ...validateGovernedResponse(def, input.answers, gov),
    ]),
  ];
  if (problems.length) return { ok: false, error: 'validation', problems };

  const { answers, missingRequired } = applyFormGovernance(def, input.answers, gov);
  if (missingRequired.length) {
    return { ok: false, error: 'validation', problems: missingRequired.map((k) => `'${k}' is required`) };
  }

  // Before/After audit: snapshot the prior entity values for the bound fields the
  // user actually changed, stored inside the immutable response (reserved __audit).
  const stored: FormAnswers = { ...answers };
  if (entity && input.recordId) {
    const boundKeys = allFields(def)
      .filter((f) => f.governanceKey && f.key in answers)
      .map((f) => f.governanceKey!);
    const before = await loadBeforeSnapshot(supabase, entity, input.recordId, boundKeys);
    if (before) {
      const after = Object.fromEntries(boundKeys.filter((k) => k in before).map((k) => [k, answers[k]]));
      stored.__audit = { before, after };
    }
  }

  const score = scoreFormResponse(def, answers);
  const { data, error } = await supabase
    .from('erp_form_responses')
    .insert({
      company_id: ctx.companyId,
      form_id: formRow.id,
      version: verRow.version,
      entity,
      record_id: input.recordId ?? null,
      answers: stored,
      score,
      created_by: ctx.userId,
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: (data as { id: string }).id };
}
