import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import type { CustomFieldDef } from './custom-fields';

/** ── Custom Fields — server-side resolver ──────────────────────────────────
 *  Loads a company's custom field definitions for an entity (RLS scopes to the
 *  caller's company). Shared by the Import Engine, Export Engine, and Dynamic
 *  Forms so the field set is resolved identically everywhere. */

const SELECT = 'id, entity, key, label_ar, label_en, type, required, options, validation, visibility, sort, is_active';

type Row = {
  id: string; entity: string; key: string; label_ar: string; label_en: string | null;
  type: CustomFieldDef['type']; required: boolean; options: unknown; validation: unknown;
  visibility: unknown; sort: number; is_active: boolean;
};
function toDef(r: Row): CustomFieldDef {
  return {
    id: r.id, entity: r.entity, key: r.key, label_ar: r.label_ar, label_en: r.label_en,
    type: r.type, required: r.required,
    options: Array.isArray(r.options) ? (r.options as CustomFieldDef['options']) : [],
    validation: (r.validation as CustomFieldDef['validation']) ?? {},
    visibility: (r.visibility as CustomFieldDef['visibility']) ?? null,
    sort: r.sort, is_active: r.is_active,
  };
}

/** Active custom fields for an entity (for import/export/forms).
 *
 *  Pass `companyId` when calling with a service-role client (no RLS) — e.g. the
 *  inbound integration API — so definitions stay scoped to one tenant. The
 *  RLS-backed callers (import/export/forms with a user session) omit it. */
export async function getActiveCustomFields(
  entityKey: string,
  client?: SupabaseClient,
  companyId?: string,
): Promise<CustomFieldDef[]> {
  const supabase = client ?? (await createClient());
  let query = supabase
    .from('erp_custom_fields')
    .select(SELECT)
    .eq('entity', entityKey)
    .eq('is_active', true);
  if (companyId) query = query.eq('company_id', companyId);
  const { data } = await query.order('sort', { ascending: true });
  return ((data as Row[]) ?? []).map(toDef);
}

/** All custom fields (incl. inactive) for an entity — for the management UI. */
export async function getAllCustomFields(entityKey: string): Promise<CustomFieldDef[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_custom_fields')
    .select(SELECT)
    .eq('entity', entityKey)
    .order('sort', { ascending: true });
  return ((data as Row[]) ?? []).map(toDef);
}
