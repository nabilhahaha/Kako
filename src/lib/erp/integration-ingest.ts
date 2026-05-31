import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getEntity, entityUniqueKey } from './entities';
import { getActiveCustomFields } from './custom-fields-server';
import { coerceCustomValue, validateCustomValue } from './custom-fields';

/** ── Inbound API ingest — reuses the entity-registry writer path ───────────
 *  Writes one record for a registered entity, company-scoped. This is the SAME
 *  descriptor-driven logic the Import Engine uses (allowed-field projection,
 *  number coercion, custom-field bag, external_id upsert) — not a duplicate
 *  business path. The caller is the /api/v1 route, which has already resolved
 *  the company from the API key and checked the entity scope.
 *
 *  SECURITY: this runs under the service-role client (RLS bypassed). company_id
 *  is taken ONLY from the resolved key (the `companyId` arg), set explicitly on
 *  the write, and used to scope the existence lookup and update — the request
 *  body can never set or change the tenant. */

export type IngestMode = 'insert' | 'update' | 'upsert';
export interface IngestResult {
  ok: boolean;
  action?: 'inserted' | 'updated';
  id?: string;
  error?: string;
}

export async function ingestRecord(
  db: SupabaseClient,
  companyId: string,
  entityKey: string,
  record: Record<string, unknown>,
  mode: IngestMode = 'upsert',
): Promise<IngestResult> {
  const entity = getEntity(entityKey);
  if (!entity || !entity.fields) return { ok: false, error: 'unknown entity' };

  const allowed = new Set(entity.fields.map((f) => f.key));
  const numberKeys = new Set(entity.fields.filter((f) => f.type === 'number').map((f) => f.key));
  // Company-scoped explicitly: service-role bypasses RLS, so we must pass the id.
  const customDefs = await getActiveCustomFields(entityKey, db, companyId);

  // Validate required + typed fields (same rules as the Import Engine).
  for (const fld of entity.fields) {
    const raw = record[fld.key];
    const v = raw == null ? '' : String(raw).trim();
    if (fld.required && !v) return { ok: false, error: `${fld.key} is required` };
    if (v && fld.type === 'number' && Number.isNaN(Number(v))) return { ok: false, error: `${fld.key}: invalid number` };
    if (v && fld.type === 'date' && Number.isNaN(Date.parse(v))) return { ok: false, error: `${fld.key}: invalid date` };
  }
  for (const cf of customDefs) {
    const msg = validateCustomValue(cf, record[cf.key]);
    if (msg) return { ok: false, error: msg };
  }

  // Build the payload from the descriptor only; company_id never from the body.
  const payload: Record<string, unknown> = { company_id: companyId };
  for (const k of Object.keys(record)) {
    if (!allowed.has(k)) continue;
    const raw = record[k];
    if (raw == null || String(raw).trim() === '') continue;
    payload[k] = numberKeys.has(k) ? Number(raw) : typeof raw === 'string' ? raw.trim() : raw;
  }
  if (customDefs.length > 0) {
    const bag: Record<string, unknown> = {};
    for (const cf of customDefs) {
      const val = coerceCustomValue(cf, record[cf.key]);
      if (val !== undefined) bag[cf.key] = val;
    }
    if (Object.keys(bag).length > 0) payload.custom = bag;
  }

  // Existence lookup is ALWAYS company-scoped.
  const uniqueKey = entityUniqueKey(entity);
  const ukVal = uniqueKey ? String(payload[uniqueKey] ?? '').trim() : '';
  let existingId: string | null = null;
  if (uniqueKey && ukVal) {
    const { data: ex } = await db
      .from(entity.table)
      .select('id')
      .eq('company_id', companyId)
      .eq(uniqueKey, ukVal)
      .maybeSingle();
    existingId = (ex as { id: string } | null)?.id ?? null;
  }

  if (existingId) {
    if (mode === 'insert') return { ok: false, error: 'record already exists' };
    const { error } = await db
      .from(entity.table)
      .update(payload)
      .eq('id', existingId)
      .eq('company_id', companyId);
    if (error) return { ok: false, error: error.message };
    return { ok: true, action: 'updated', id: existingId };
  }
  if (mode === 'update') return { ok: false, error: 'record not found' };
  const { data, error } = await db.from(entity.table).insert(payload).select('id').single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, action: 'inserted', id: (data as { id: string }).id };
}
