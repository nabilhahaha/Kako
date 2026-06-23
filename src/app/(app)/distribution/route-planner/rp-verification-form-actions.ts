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
import { FORM_BUILDER_ENABLED } from '@/lib/form-builder';
import { resolveFvForm, isFvFieldKey, FV_DEFAULT_REQUIRE_GPS, type FvFieldOverride, type ResolvedFvField } from './fv-verification-form';

type ResultD<T> = { ok: true; data: T } | { ok: false; error: string };

export const FV_FORM_CODE = 'fv_verification';

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
