import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { missingDocTypes } from './lifecycle';
import { pickEntityRow } from './registry';
import { getChangeRequestEntity } from './registry-server';

// Server-side change-request attachment helpers. Document categories come from the
// doc-type registry (global + per-company); a request's required documents are
// resolved against the erp_attachments rows tagged with doc_type.

export interface DocTypeOption { docKey: string; labelEn: string | null; labelAr: string | null }

/** The document types an entity accepts (its attachment_types ∩ active registry). */
export async function getChangeRequestDocTypes(
  supabase: SupabaseClient,
  entityKey: string,
  companyId: string,
): Promise<DocTypeOption[]> {
  const entity = await getChangeRequestEntity(supabase, entityKey, companyId);
  const allowed = entity?.attachmentTypes ?? [];
  if (allowed.length === 0) return [];
  const { data } = await supabase
    .from('erp_change_request_doc_types')
    .select('company_id, doc_key, label_en, label_ar, is_active')
    .or(`company_id.eq.${companyId},company_id.is.null`)
    .in('doc_key', allowed);
  const rows = ((data ?? []) as { company_id: string | null; doc_key: string; label_en: string | null; label_ar: string | null; is_active: boolean | null }[])
    .filter((r) => r.is_active !== false);
  // Keep registry order = the entity's declared order; company row wins over global.
  return allowed
    .map((key) => {
      const r = pickEntityRow(rows.filter((x) => x.doc_key === key), companyId);
      return r ? { docKey: key, labelEn: r.label_en, labelAr: r.label_ar } : null;
    })
    .filter((x): x is DocTypeOption => x !== null);
}

/** Whether a request carries an attachment for each required document type. */
export async function requiredDocTypesSatisfied(
  supabase: SupabaseClient,
  requestId: string,
  required: string[],
): Promise<{ ok: boolean; missing: string[] }> {
  if (required.length === 0) return { ok: true, missing: [] };
  const { data } = await supabase
    .from('erp_attachments')
    .select('doc_type')
    .eq('entity', 'change_request')
    .eq('record_id', requestId)
    .is('deleted_at', null);
  const present = ((data ?? []) as { doc_type: string | null }[])
    .map((r) => r.doc_type)
    .filter((d): d is string => !!d);
  const missing = missingDocTypes(required, present);
  return { ok: missing.length === 0, missing };
}
