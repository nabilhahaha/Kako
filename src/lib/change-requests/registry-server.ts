import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseEntityRow, pickEntityRow } from './registry';
import type { ChangeRequestEntity, ChangeRequestEntityRow } from './types';

// Server-side accessor over the canonical DB metadata. Resolves an entity's
// config = the company-specific row if present, else the global default — the
// same fallback the workflow engine uses. RLS already restricts visibility to
// global rows + the caller's company.

const COLUMNS =
  'company_id, entity_key, target_table, id_column, label_en, label_ar, create_permission, ' +
  'approve_permission, workflow_key, allowed_fields, validation, attachment_types, ' +
  'supports_effective_dating, supports_bulk, bulk_max, notification_template, is_active';

/** The resolved, typed config for a governed entity (or null if unregistered). */
export async function getChangeRequestEntity(
  supabase: SupabaseClient,
  entityKey: string,
  companyId: string,
): Promise<ChangeRequestEntity | null> {
  const { data } = await supabase
    .from('erp_change_request_entities')
    .select(COLUMNS)
    .eq('entity_key', entityKey)
    .or(`company_id.eq.${companyId},company_id.is.null`);
  const rows = ((data ?? []) as unknown as ChangeRequestEntityRow[]).filter((r) => r.is_active !== false);
  const picked = pickEntityRow(rows, companyId);
  return picked ? parseEntityRow(picked) : null;
}
