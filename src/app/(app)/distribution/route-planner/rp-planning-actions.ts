'use server';

// ============================================================================
// Wave A — server persistence for low-risk planning artifacts:
//   * Saved Segments      (erp_rp_segments)            — owner-private named filters
//   * Mapping/Route Templates (erp_rp_field_mappings, kind='template') — company-shared
//
// Filter/metadata only — NO customer rows are stored here (that is Wave B). Company-
// scoped + RLS-protected (migration 0359). The client keeps localStorage as a cache /
// offline fallback and migrates any local-only items up on first load (idempotent).
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function ctxOrNull() {
  const ctx = await getUserContext();
  return ctx?.companyId ? ctx : null;
}

// ── Saved Segments ──────────────────────────────────────────────────────────
export interface ServerSegment {
  id: string;
  name: string;
  filter: Record<string, string | undefined>;
  createdAt: number;
}

function rowToSegment(r: { id: string; name: string; filter: unknown; created_at: string }): ServerSegment {
  return {
    id: r.id,
    name: r.name,
    filter: (r.filter as Record<string, string | undefined>) ?? {},
    createdAt: new Date(r.created_at).getTime(),
  };
}

export async function listSegments(): Promise<Result<ServerSegment[]>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { data, error } = await sb.from('erp_rp_segments')
    .select('id, name, filter, created_at')
    .eq('company_id', ctx.companyId).eq('owner_id', ctx.userId)
    .order('created_at', { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []).map(rowToSegment) };
}

/** Save (or replace by exact name, per owner) a named segment. Returns the new list. */
export async function saveSegment(name: string, filter: Record<string, string | undefined>): Promise<Result<ServerSegment[]>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const clean = name.trim();
  if (!clean) return listSegments();
  const sb = await createClient();
  // Strip empty predicates so the stored filter is minimal.
  const compact: Record<string, string> = {};
  for (const [k, v] of Object.entries(filter)) if (v && String(v).trim()) compact[k] = String(v).trim();
  const { error } = await sb.from('erp_rp_segments').upsert(
    { company_id: ctx.companyId, owner_id: ctx.userId, name: clean, filter: compact, updated_at: new Date().toISOString() },
    { onConflict: 'company_id,owner_id,lower(name)' as never } as never,
  );
  // onConflict on a functional index isn't expressible via PostgREST → fall back to
  // delete-by-name + insert when the upsert path is rejected.
  if (error) {
    await sb.from('erp_rp_segments').delete().eq('company_id', ctx.companyId).eq('owner_id', ctx.userId).ilike('name', clean);
    const { error: insErr } = await sb.from('erp_rp_segments')
      .insert({ company_id: ctx.companyId, owner_id: ctx.userId, name: clean, filter: compact });
    if (insErr) return { ok: false, error: insErr.message };
  }
  return listSegments();
}

export async function deleteSegment(id: string): Promise<Result<ServerSegment[]>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { error } = await sb.from('erp_rp_segments').delete().eq('id', id).eq('company_id', ctx.companyId).eq('owner_id', ctx.userId);
  if (error) return { ok: false, error: error.message };
  return listSegments();
}

/** One-time migration: push any localStorage-only segments to the server. Idempotent —
 *  existing names (per owner) are left untouched. Returns the merged server list. */
export async function migrateLocalSegments(items: { name: string; filter: Record<string, string | undefined> }[]): Promise<Result<ServerSegment[]>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  if (!items?.length) return listSegments();
  const sb = await createClient();
  const { data: existing } = await sb.from('erp_rp_segments').select('name').eq('company_id', ctx.companyId).eq('owner_id', ctx.userId);
  const have = new Set((existing ?? []).map((r) => String(r.name).toLowerCase()));
  const rows = items
    .filter((it) => it.name?.trim() && !have.has(it.name.trim().toLowerCase()))
    .map((it) => {
      const compact: Record<string, string> = {};
      for (const [k, v] of Object.entries(it.filter ?? {})) if (v && String(v).trim()) compact[k] = String(v).trim();
      return { company_id: ctx.companyId, owner_id: ctx.userId, name: it.name.trim(), filter: compact };
    });
  if (rows.length) {
    const { error } = await sb.from('erp_rp_segments').insert(rows);
    if (error) return { ok: false, error: error.message };
  }
  return listSegments();
}

// ── Mapping / Route Templates (reuse erp_rp_field_mappings, kind='template') ──
export interface ServerTemplate {
  id: string;
  name: string;
  headers: string[];
  fingerprint: string;
  mapping: Record<string, string>;
  createdAt: number;
}

function rowToTemplate(r: { id: string; name: string | null; headers: unknown; fingerprint: string | null; mapping: unknown; created_at: string }): ServerTemplate {
  return {
    id: r.id,
    name: r.name ?? '',
    headers: Array.isArray(r.headers) ? (r.headers as string[]) : [],
    fingerprint: r.fingerprint ?? '',
    mapping: (r.mapping as Record<string, string>) ?? {},
    createdAt: new Date(r.created_at).getTime(),
  };
}

export async function listMappingTemplates(): Promise<Result<ServerTemplate[]>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { data, error } = await sb.from('erp_rp_field_mappings')
    .select('id, name, headers, fingerprint, mapping, created_at')
    .eq('company_id', ctx.companyId).eq('kind', 'template')
    .order('created_at', { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []).map(rowToTemplate) };
}

/** Save (or replace by exact name, company-shared) a mapping template. */
export async function saveMappingTemplate(
  name: string, headers: readonly string[], fingerprint: string, mapping: Record<string, string>,
): Promise<Result<ServerTemplate[]>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const clean = name.trim();
  if (!clean) return listMappingTemplates();
  const sb = await createClient();
  // Replace-by-name (company-shared, case-insensitive) then insert — avoids functional-
  // index onConflict limits and keeps the "one format per name" guarantee.
  await sb.from('erp_rp_field_mappings').delete().eq('company_id', ctx.companyId).eq('kind', 'template').ilike('name', clean);
  const { error } = await sb.from('erp_rp_field_mappings').insert({
    company_id: ctx.companyId, kind: 'template', entity: 'customer_master',
    name: clean, headers: [...headers], fingerprint, mapping, owner_id: ctx.userId,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  return listMappingTemplates();
}

export async function deleteMappingTemplate(id: string): Promise<Result<ServerTemplate[]>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { error } = await sb.from('erp_rp_field_mappings').delete().eq('id', id).eq('company_id', ctx.companyId).eq('kind', 'template');
  if (error) return { ok: false, error: error.message };
  return listMappingTemplates();
}

/** One-time migration: push localStorage-only templates up. Idempotent by name. */
export async function migrateLocalTemplates(
  items: { name: string; headers: string[]; fingerprint: string; mapping: Record<string, string> }[],
): Promise<Result<ServerTemplate[]>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  if (!items?.length) return listMappingTemplates();
  const sb = await createClient();
  const { data: existing } = await sb.from('erp_rp_field_mappings').select('name').eq('company_id', ctx.companyId).eq('kind', 'template');
  const have = new Set((existing ?? []).map((r) => String(r.name ?? '').toLowerCase()));
  const rows = items
    .filter((it) => it.name?.trim() && !have.has(it.name.trim().toLowerCase()))
    .map((it) => ({
      company_id: ctx.companyId, kind: 'template', entity: 'customer_master',
      name: it.name.trim(), headers: it.headers ?? [], fingerprint: it.fingerprint ?? '',
      mapping: it.mapping ?? {}, owner_id: ctx.userId,
    }));
  if (rows.length) {
    const { error } = await sb.from('erp_rp_field_mappings').insert(rows);
    if (error) return { ok: false, error: error.message };
  }
  return listMappingTemplates();
}
