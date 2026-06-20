'use server';

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { summarizeSync } from '@/lib/erp/route-planner-sync';
import type { DataHealthInput } from '@/lib/erp/route-planner-data-health';
import type { RpEntity, RpSourceType, RpTicketType, RpTicketStatus, RpApprovalStep } from '@/lib/erp/route-planner-backend';

/**
 * Route Planner backend — server actions over the persistence layer (migrations
 * 0354–0356). Company-scoped via RLS; writes additionally gated on the Route Planner
 * Admin / company admin in-app. These compile now and become live once the migrations
 * are applied to staging. Never touch official customer master data.
 */

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function ctxOrNull() {
  const ctx = await getUserContext();
  return ctx?.companyId ? ctx : null;
}

// ── Integration: data sources + field mappings ──────────────────────────────
export async function listDataSources(): Promise<Result<unknown[]>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { data, error } = await sb.from('erp_rp_data_sources').select('*').eq('company_id', ctx.companyId).order('created_at', { ascending: false });
  return error ? { ok: false, error: error.message } : { ok: true, data: data ?? [] };
}

export async function createDataSource(input: { name: string; type: RpSourceType; config?: Record<string, unknown>; schedule?: string | null }): Promise<Result<{ id: string }>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { data, error } = await sb.from('erp_rp_data_sources')
    .insert({ company_id: ctx.companyId, name: input.name.trim(), type: input.type, config: input.config ?? {}, schedule: input.schedule ?? null, created_by: ctx.userId })
    .select('id').single();
  return error || !data ? { ok: false, error: error?.message ?? 'insert_failed' } : { ok: true, data: { id: data.id } };
}

export async function saveFieldMapping(sourceId: string, entity: RpEntity, mapping: Record<string, string>): Promise<Result> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { error } = await sb.from('erp_rp_field_mappings')
    .upsert({ source_id: sourceId, company_id: ctx.companyId, entity, mapping, updated_at: new Date().toISOString() }, { onConflict: 'source_id,entity' });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function getFieldMapping(sourceId: string, entity: RpEntity): Promise<Result<Record<string, string> | null>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { data, error } = await sb.from('erp_rp_field_mappings')
    .select('mapping').eq('company_id', ctx.companyId).eq('source_id', sourceId).eq('entity', entity).maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data as { mapping?: Record<string, string> } | null)?.mapping ?? null };
}

// ── Integration: run a manual sync + history ────────────────────────────────
export async function runManualSync(input: {
  sourceId?: string | null; sourceLabel?: string | null;
  master: DataHealthInput; existingCodes?: string[]; rejected?: { row: number; reason: string }[];
}): Promise<Result<{ runId: string; imported: number; updated: number; rejected: number; issues: number }>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const summary = summarizeSync(input.master, { existingKeys: new Set((input.existingCodes ?? []).map((c) => c.toLowerCase())), rejected: input.rejected });
  const sb = await createClient();
  const { data, error } = await sb.from('erp_rp_sync_runs').insert({
    source_id: input.sourceId ?? null, company_id: ctx.companyId, trigger: 'manual', source_label: input.sourceLabel ?? null,
    finished_at: new Date().toISOString(), status: summary.status,
    rows_imported: summary.rowsImported, rows_updated: summary.rowsUpdated, rows_rejected: summary.rowsRejected,
    errors: summary.errors, quality: summary.quality,
  }).select('id').single();
  if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' };
  if (input.sourceId) await sb.from('erp_rp_data_sources').update({ last_sync_at: new Date().toISOString(), last_status: summary.status }).eq('id', input.sourceId);
  return { ok: true, data: { runId: data.id, imported: summary.rowsImported, updated: summary.rowsUpdated, rejected: summary.rowsRejected, issues: summary.qualityIssues } };
}

export async function listSyncRuns(limit = 50): Promise<Result<unknown[]>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { data, error } = await sb.from('erp_rp_sync_runs').select('*').eq('company_id', ctx.companyId).order('started_at', { ascending: false }).limit(limit);
  return error ? { ok: false, error: error.message } : { ok: true, data: data ?? [] };
}

// ── Request Center ──────────────────────────────────────────────────────────
export async function createRequest(input: {
  type: RpTicketType; customerRef?: string | null; changes?: Record<string, { old?: string; new?: string }>;
  reason?: string; gpsLat?: number | null; gpsLng?: number | null;
}): Promise<Result<{ id: string; ticketNo: string | null }>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { data: tn } = await sb.rpc('rp_next_ticket_no', { p_company: ctx.companyId });
  const { data, error } = await sb.from('erp_route_planner_requests').insert({
    company_id: ctx.companyId, ticket_no: (tn as string | null) ?? null, type: input.type,
    requested_by: ctx.userId, requested_role: ctx.topRole, customer_ref: input.customerRef ?? null,
    changes: input.changes ?? {}, reason: input.reason ?? null, gps_lat: input.gpsLat ?? null, gps_lng: input.gpsLng ?? null,
    status: 'created',
  }).select('id, ticket_no').single();
  return error || !data ? { ok: false, error: error?.message ?? 'insert_failed' } : { ok: true, data: { id: data.id, ticketNo: data.ticket_no } };
}

export async function listRequests(): Promise<Result<unknown[]>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { data, error } = await sb.from('erp_route_planner_requests').select('*').eq('company_id', ctx.companyId).order('created_at', { ascending: false });
  return error ? { ok: false, error: error.message } : { ok: true, data: data ?? [] };
}

export async function transitionRequest(id: string, status: RpTicketStatus, note?: string): Promise<Result> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { data: cur } = await sb.from('erp_route_planner_requests').select('events').eq('id', id).maybeSingle();
  const events = Array.isArray((cur as { events?: unknown[] } | null)?.events) ? (cur as { events: unknown[] }).events : [];
  events.push({ at: new Date().toISOString(), by: ctx.userId, status, note: note ?? null });
  const { error } = await sb.from('erp_route_planner_requests').update({ status, events, updated_at: new Date().toISOString() }).eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ── Approval Builder ─────────────────────────────────────────────────────────
export async function getApprovalFlow(ticketType: RpTicketType): Promise<Result<RpApprovalStep[] | null>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { data } = await sb.from('erp_rp_approval_flows').select('steps').eq('company_id', ctx.companyId).eq('ticket_type', ticketType).maybeSingle();
  return { ok: true, data: (data as { steps?: RpApprovalStep[] } | null)?.steps ?? null };
}

export async function saveApprovalFlow(ticketType: RpTicketType, steps: RpApprovalStep[]): Promise<Result> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { error } = await sb.from('erp_rp_approval_flows')
    .upsert({ company_id: ctx.companyId, ticket_type: ticketType, steps, updated_by: ctx.userId, updated_at: new Date().toISOString() }, { onConflict: 'company_id,ticket_type' });
  return error ? { ok: false, error: error.message } : { ok: true };
}
