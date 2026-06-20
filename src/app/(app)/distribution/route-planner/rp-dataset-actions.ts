'use server';

// ============================================================================
// Wave B — persisted customer working set (the linchpin).
//   * erp_rp_datasets            — one header per saved/synced working set
//   * erp_rp_dataset_customers   — the customer rows (the planning data)
//
// ONE persisted model that Manual Upload AND every connector write into. Company-scoped
// + RLS-protected (migration 0360). Visible to the owner + their reporting subtree (so a
// manager sees the team's datasets). IndexedDB stays the unsaved-draft tier only.
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { datasetBbox, splitDatasetColumns, countValid, type Bbox } from '@/lib/erp/route-planner-dataset';

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const MAX_ROWS = 20000;       // matches the connector pipeline cap
const CHUNK = 1000;           // bulk-insert batch size

/** The persisted customer shape (a superset of HCustomer / DpCustomer columns; the rest
 *  rides in `attrs`). lat/lng are stored as given; validation is name + finite coords. */
export interface DatasetCustomerInput {
  code?: string | null; name: string; lat?: number | null; lng?: number | null;
  salesman?: string | null; route?: string | null; channel?: string | null; class?: string | null;
  city?: string | null; area?: string | null; region?: string | null;
  [k: string]: unknown;   // long tail → attrs
}

export interface DatasetHeader {
  id: string; name: string; source: string; sourceId: string | null;
  rowCount: number; validCount: number; isActive: boolean;
  bbox: Bbox | null;
  createdAt: number;
}

async function ctxOrNull() {
  const ctx = await getUserContext();
  return ctx?.companyId ? ctx : null;
}

function toRow(c: DatasetCustomerInput, datasetId: string, companyId: string, seq: number) {
  const { columns, attrs } = splitDatasetColumns(c);
  return {
    dataset_id: datasetId, company_id: companyId, seq,
    code: (columns.code as string | null) ?? null, name: String(c.name),
    lat: (columns.lat as number | null) ?? null, lng: (columns.lng as number | null) ?? null,
    salesman: (columns.salesman as string | null) ?? null, route: (columns.route as string | null) ?? null,
    channel: (columns.channel as string | null) ?? null, class: (columns.class as string | null) ?? null,
    city: (columns.city as string | null) ?? null, area: (columns.area as string | null) ?? null,
    region: (columns.region as string | null) ?? null, attrs,
  };
}

function headerOf(r: Record<string, unknown>): DatasetHeader {
  return {
    id: r.id as string, name: (r.name as string) ?? '', source: (r.source as string) ?? 'manual_upload',
    sourceId: (r.source_id as string | null) ?? null,
    rowCount: (r.row_count as number) ?? 0, validCount: (r.valid_count as number) ?? 0,
    isActive: Boolean(r.is_active), bbox: (r.bbox as DatasetHeader['bbox']) ?? null,
    createdAt: new Date(r.created_at as string).getTime(),
  };
}

/**
 * Persist a working set: create the header, bulk-insert the rows (chunked), set bbox +
 * counts, optionally make it the owner's active dataset. Shared by Manual Upload and the
 * connectors — the single write path for the customer model.
 */
export async function persistDataset(input: {
  name: string; source?: DatasetHeader['source']; sourceId?: string | null; syncRunId?: string | null;
  columns?: Record<string, unknown>; customers: DatasetCustomerInput[]; setActive?: boolean;
}): Promise<Result<{ id: string; rowCount: number; validCount: number }>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const name = input.name?.trim(); if (!name) return { ok: false, error: 'err_name_required' };
  const rows = (input.customers ?? []).filter((c) => c && c.name).slice(0, MAX_ROWS);
  const validCount = countValid(rows);
  const sb = await createClient();

  const { data: header, error: hErr } = await sb.from('erp_rp_datasets').insert({
    company_id: ctx.companyId, owner_id: ctx.userId, name,
    source: input.source ?? 'manual_upload', source_id: input.sourceId ?? null, sync_run_id: input.syncRunId ?? null,
    row_count: rows.length, valid_count: validCount, columns: input.columns ?? {}, bbox: datasetBbox(rows),
  }).select('id').single();
  if (hErr || !header) return { ok: false, error: hErr?.message ?? 'insert_failed' };
  const datasetId = header.id as string;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK).map((c, j) => toRow(c, datasetId, ctx.companyId!, i + j));
    const { error: rErr } = await sb.from('erp_rp_dataset_customers').insert(batch);
    if (rErr) { await sb.from('erp_rp_datasets').delete().eq('id', datasetId); return { ok: false, error: rErr.message }; }
  }

  if (input.setActive) await setActiveDataset(datasetId);
  return { ok: true, data: { id: datasetId, rowCount: rows.length, validCount } };
}

export async function listDatasets(): Promise<Result<DatasetHeader[]>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { data, error } = await sb.from('erp_rp_datasets')
    .select('id, name, source, source_id, row_count, valid_count, is_active, bbox, created_at')
    .eq('company_id', ctx.companyId).order('created_at', { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []).map(headerOf) };
}

/** A page of customers from a dataset (stable `seq` order). For large-dataset loading. */
export async function getDatasetPage(datasetId: string, offset = 0, limit = 1000): Promise<Result<{ rows: Record<string, unknown>[]; total: number }>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const lim = Math.min(Math.max(1, limit), 5000);
  const { data, error, count } = await sb.from('erp_rp_dataset_customers')
    .select('seq, code, name, lat, lng, salesman, route, channel, class, city, area, region, attrs', { count: 'exact' })
    .eq('dataset_id', datasetId).order('seq', { ascending: true }).range(offset, offset + lim - 1);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { rows: data ?? [], total: count ?? (data?.length ?? 0) } };
}

export async function renameDataset(id: string, name: string): Promise<Result> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const clean = name.trim(); if (!clean) return { ok: false, error: 'err_name_required' };
  const sb = await createClient();
  const { error } = await sb.from('erp_rp_datasets').update({ name: clean, updated_at: new Date().toISOString() }).eq('id', id).eq('company_id', ctx.companyId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteDataset(id: string): Promise<Result> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { error } = await sb.from('erp_rp_datasets').delete().eq('id', id).eq('company_id', ctx.companyId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Make `id` the owner's single active planning dataset (clears any previous active). */
export async function setActiveDataset(id: string): Promise<Result> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  // Clear the current active first to satisfy the one-active-per-owner unique index.
  await sb.from('erp_rp_datasets').update({ is_active: false }).eq('company_id', ctx.companyId).eq('owner_id', ctx.userId).eq('is_active', true);
  const { error } = await sb.from('erp_rp_datasets').update({ is_active: true, updated_at: new Date().toISOString() })
    .eq('id', id).eq('company_id', ctx.companyId).eq('owner_id', ctx.userId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** The owner's active dataset header (or null). Drives "resume where I left off". */
export async function getActiveDataset(): Promise<Result<DatasetHeader | null>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { data, error } = await sb.from('erp_rp_datasets')
    .select('id, name, source, source_id, row_count, valid_count, is_active, bbox, created_at')
    .eq('company_id', ctx.companyId).eq('owner_id', ctx.userId).eq('is_active', true).maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data ? headerOf(data) : null };
}
