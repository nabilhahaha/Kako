'use server';

// ============================================================================
// Field Verification — form configuration actions (Form Builder Phase 1).
//   * READ the company's configured verification-field layout (this file, PR 1).
//   * SAVE/PUBLISH (admin) + rep consumption arrive in the next PRs.
//
// Reuses the existing Form Builder storage (erp_forms + erp_form_versions, migration
// 0240) — code 'fv_verification', schema jsonb { fields: FvFieldOverride[] }. The pure
// resolveFvForm() applies the guardrails so the config can never weaken the submit /
// radius / photo rules. Gated by KAKO_FORM_BUILDER + the presence of a published config;
// with neither, the rep flow stays byte-identical to today (defaults).
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { FORM_BUILDER_ENABLED } from '@/lib/form-builder';
import { resolveFvForm, isFvFieldKey, buildFvFormSchema, FV_FORM_CODE, FV_DEFAULT_REQUIRE_GPS, type FvFieldOverride, type ResolvedFvField } from './fv-verification-form';

type Result = { ok: true } | { ok: false; error: string };
type ResultD<T> = { ok: true; data: T } | { ok: false; error: string };

/** Read the form-level GPS/radius lock toggle from the stored schema.settings (default = on). */
function parseRequireGps(schema: unknown): boolean {
  const v = (schema as { settings?: { requireGps?: unknown } } | null)?.settings?.requireGps;
  return typeof v === 'boolean' ? v : FV_DEFAULT_REQUIRE_GPS;
}

/** Map an arbitrary stored schema.fields jsonb to safe, typed FvFieldOverride[]. */
function parseOverrides(schema: unknown): FvFieldOverride[] {
  const fields = (schema as { fields?: unknown } | null)?.fields;
  if (!Array.isArray(fields)) return [];
  const out: FvFieldOverride[] = [];
  for (const f of fields) {
    const k = (f as { key?: unknown })?.key;
    if (!isFvFieldKey(k)) continue;
    const o = f as Record<string, unknown>;
    out.push({
      key: k,
      labelEn: typeof o.labelEn === 'string' ? o.labelEn : undefined,
      labelAr: typeof o.labelAr === 'string' ? o.labelAr : undefined,
      visible: typeof o.visible === 'boolean' ? o.visible : undefined,
      required: typeof o.required === 'boolean' ? o.required : undefined,
      help: typeof o.help === 'string' ? o.help : undefined,
      order: typeof o.order === 'number' ? o.order : undefined,
    });
  }
  return out;
}

/** The company's effective verification form. `configured` = a published config exists AND
 *  the form-builder flag is on; otherwise the default layout + requireGps=on (today's
 *  behavior, byte-for-byte). `requireGps` is the form-level radius/GPS lock toggle. */
export async function getFvVerificationForm(): Promise<ResultD<{ fields: ResolvedFvField[]; requireGps: boolean; configured: boolean }>> {
  const ctx = await getUserContext();
  if (!ctx?.companyId) return { ok: false, error: 'err_unauthorized' };

  const def = { fields: resolveFvForm(null), requireGps: FV_DEFAULT_REQUIRE_GPS, configured: false };
  if (!FORM_BUILDER_ENABLED()) return { ok: true, data: def };

  const sb = await createClient();
  const { data: form } = await sb.from('erp_forms')
    .select('id').eq('company_id', ctx.companyId).eq('code', FV_FORM_CODE).maybeSingle();
  if (!form) return { ok: true, data: def };

  const { data: ver } = await sb.from('erp_form_versions')
    .select('schema').eq('form_id', (form as { id: string }).id).eq('status', 'published')
    .order('version', { ascending: false }).limit(1).maybeSingle();
  if (!ver) return { ok: true, data: def };

  const schema = (ver as { schema: unknown }).schema;
  return { ok: true, data: { fields: resolveFvForm(parseOverrides(schema)), requireGps: parseRequireGps(schema), configured: true } };
}

/** Publish a new version of the company's verification form. Company-Admin only
 *  (field_verification.admin); flag-gated. Reuses erp_forms + erp_form_versions; the prior
 *  published version is archived. Writes the form DEFINITION only — never a verification row,
 *  customer, or photo. */
export async function saveFvVerificationForm(input: { overrides: FvFieldOverride[]; requireGps: boolean }): Promise<Result> {
  const ctx = await getUserContext();
  if (!ctx?.companyId) return { ok: false, error: 'err_unauthorized' };
  if (!hasPermission(ctx, 'field_verification.admin')) return { ok: false, error: 'err_forbidden' };
  if (!FORM_BUILDER_ENABLED()) return { ok: false, error: 'err_form_builder_disabled' };

  const schema = buildFvFormSchema(input?.overrides ?? [], !!input?.requireGps);
  const sb = await createClient();

  // Upsert the company's form row.
  const { data: existing } = await sb.from('erp_forms')
    .select('id').eq('company_id', ctx.companyId).eq('code', FV_FORM_CODE).maybeSingle();
  let formId = (existing as { id: string } | null)?.id ?? null;
  if (!formId) {
    const { data: ins, error: fErr } = await sb.from('erp_forms')
      .insert({ company_id: ctx.companyId, code: FV_FORM_CODE, name_en: 'Field Verification', name_ar: 'التحقق الميداني', entity: 'customer', is_active: true, created_by: ctx.userId })
      .select('id').single();
    if (fErr) return { ok: false, error: fErr.message };
    formId = (ins as { id: string }).id;
  }

  // Next version number; archive the previous published version (read picks latest published).
  const { data: last } = await sb.from('erp_form_versions')
    .select('version').eq('form_id', formId).order('version', { ascending: false }).limit(1).maybeSingle();
  const nextVersion = (((last as { version: number } | null)?.version) ?? 0) + 1;
  await sb.from('erp_form_versions').update({ status: 'archived' }).eq('form_id', formId).eq('status', 'published');

  const { error: vErr } = await sb.from('erp_form_versions').insert({
    company_id: ctx.companyId, form_id: formId, version: nextVersion, schema,
    status: 'published', published_at: new Date().toISOString(),
  });
  if (vErr) return { ok: false, error: vErr.message };
  return { ok: true };
}

/** Reset to the default form: archive the published version so the read falls back to
 *  defaults (today's behavior). Company-Admin only. Never deletes data. */
export async function resetFvVerificationForm(): Promise<Result> {
  const ctx = await getUserContext();
  if (!ctx?.companyId) return { ok: false, error: 'err_unauthorized' };
  if (!hasPermission(ctx, 'field_verification.admin')) return { ok: false, error: 'err_forbidden' };
  const sb = await createClient();
  const { data: form } = await sb.from('erp_forms')
    .select('id').eq('company_id', ctx.companyId).eq('code', FV_FORM_CODE).maybeSingle();
  if (form) {
    await sb.from('erp_form_versions').update({ status: 'archived' })
      .eq('form_id', (form as { id: string }).id).eq('status', 'published');
  }
  return { ok: true };
}
