import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { getEntity, entityCapabilities } from '@/lib/erp/entities';
import { ingestRecord, type IngestMode } from '@/lib/erp/integration-ingest';
import { apiKeyHashLiteral } from '@/lib/erp/integration-crypto';
import {
  isInboundEntity, hasScope, RATE_LIMIT_PER_WINDOW, RATE_WINDOW_MS,
} from '@/lib/erp/integration';

/** ── Inbound REST API — POST /api/v1/{entity} ──────────────────────────────
 *  Single public integration surface for EVERY enabled entity (Phase 2A:
 *  customer, supplier, product). Authenticated by a per-company API key
 *  (Authorization: Bearer vtk_live_…); writes go through the existing
 *  entity-registry ingest path, company-scoped to the key's company. Every call
 *  is scope-checked, rate-limited, and logged to erp_integration_logs.
 *
 *  Body: a single record object, an array of records, or { records: [...] }.
 *  Mode:  ?mode=insert|update|upsert (default upsert), matched by external_id.
 *  Runs on the Node runtime (service-role client + crypto). */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_RECORDS = 500;

function problem(status: number, title: string, detail: string, requestId: string) {
  return NextResponse.json(
    { type: `https://vantora.app/errors/${title}`, title, status, detail, requestId },
    { status, headers: { 'X-VANTORA-Request-Id': requestId, 'Cache-Control': 'no-store' } },
  );
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ entity: string }> }) {
  const requestId = randomUUID();
  const headers = { 'X-VANTORA-Request-Id': requestId, 'Cache-Control': 'no-store' };

  // ── Resolve the target entity (accept singular or plural path segment) ──
  const { entity: seg } = await ctx.params;
  let entityKey = seg;
  if (!isInboundEntity(entityKey) && seg.endsWith('s') && isInboundEntity(seg.slice(0, -1))) {
    entityKey = seg.slice(0, -1);
  }
  const entity = getEntity(entityKey);
  if (!entity || !isInboundEntity(entityKey) || !entityCapabilities(entityKey).apiAccess) {
    return problem(404, 'unknown-entity', `Entity "${seg}" is not available on the API.`, requestId);
  }

  // ── Authenticate the API key ──
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!token) return problem(401, 'unauthorized', 'Missing Bearer API key.', requestId);

  let db;
  try {
    db = createServiceClient();
  } catch {
    return problem(503, 'unconfigured', 'Integration API is not configured.', requestId);
  }

  const { data: resolved, error: resolveErr } = await db.rpc('erp_api_key_resolve', {
    p_hash: apiKeyHashLiteral(token),
  });
  const keyRow = (resolved as { key_id: string; company_id: string; scopes: string[] }[] | null)?.[0];
  if (resolveErr || !keyRow) return problem(401, 'unauthorized', 'Invalid or revoked API key.', requestId);
  const { key_id: keyId, company_id: companyId, scopes } = keyRow;

  // ── Scope check: writing this entity requires '{entity}:write' ──
  if (!hasScope(scopes, entityKey, 'write')) {
    await db.rpc('erp_integration_log', logArgs(companyId, keyId, entityKey, 'rejected', 403, requestId, null, 'missing scope'));
    return problem(403, 'forbidden', `Key lacks the "${entityKey}:write" scope.`, requestId);
  }

  // ── Rate limit: rolling window per key ──
  const windowStart = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const { count } = await db
    .from('erp_integration_logs')
    .select('id', { count: 'exact', head: true })
    .eq('api_key_id', keyId)
    .gte('created_at', windowStart);
  if ((count ?? 0) >= RATE_LIMIT_PER_WINDOW) {
    await db.rpc('erp_integration_log', logArgs(companyId, keyId, entityKey, 'rate_limited', 429, requestId, null, 'rate limit exceeded'));
    return NextResponse.json(
      { type: 'https://vantora.app/errors/rate-limited', title: 'rate-limited', status: 429, detail: 'Too many requests.', requestId },
      { status: 429, headers: { ...headers, 'Retry-After': String(Math.ceil(RATE_WINDOW_MS / 1000)) } },
    );
  }

  // ── Idempotency: replay a prior successful result for the same key+key ──
  const idemKey = req.headers.get('idempotency-key')?.trim();
  if (idemKey) {
    const { data: prior } = await db
      .from('erp_integration_logs')
      .select('result')
      .eq('api_key_id', keyId)
      .eq('request_id', idemKey)
      .eq('status', 'ok')
      .limit(1)
      .maybeSingle();
    if (prior) {
      return NextResponse.json({ ok: true, idempotent: true, ...(prior as { result: object }).result }, { headers });
    }
  }

  // ── Parse body ──
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return problem(400, 'bad-request', 'Body must be valid JSON.', requestId);
  }
  const records: unknown[] = Array.isArray(body)
    ? body
    : body && typeof body === 'object' && Array.isArray((body as { records?: unknown[] }).records)
      ? (body as { records: unknown[] }).records
      : body && typeof body === 'object'
        ? [body]
        : [];
  if (records.length === 0) return problem(400, 'bad-request', 'No records in request body.', requestId);
  if (records.length > MAX_RECORDS) return problem(400, 'too-many', `Max ${MAX_RECORDS} records per request.`, requestId);

  const url = new URL(req.url);
  const modeParam = (url.searchParams.get('mode') ?? 'upsert').toLowerCase();
  const mode: IngestMode = (['insert', 'update', 'upsert'].includes(modeParam) ? modeParam : 'upsert') as IngestMode;

  // ── Ingest each record through the shared entity-writer path ──
  const results: { index: number; ok: boolean; action?: string; id?: string; error?: string }[] = [];
  let succeeded = 0;
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) {
      results.push({ index: i, ok: false, error: 'record must be an object' });
      continue;
    }
    const r = await ingestRecord(db, companyId, entityKey, rec as Record<string, unknown>, mode);
    if (r.ok) succeeded++;
    results.push({ index: i, ok: r.ok, action: r.action, id: r.id, error: r.error });
  }

  const status = succeeded === records.length ? 'ok' : succeeded === 0 ? 'error' : 'ok';
  const httpStatus = succeeded === 0 ? 422 : 200;
  const resultSummary = { total: records.length, succeeded, failed: records.length - succeeded, results };

  await db.rpc('erp_integration_log', {
    p_company_id: companyId, p_api_key_id: keyId, p_direction: 'inbound', p_source: 'rest_api',
    p_entity: entityKey, p_operation: `${entityKey}.${mode}`, p_status: status, p_http_status: httpStatus,
    p_request_id: idemKey || requestId,
    p_payload: records.length === 1 ? (records[0] as object) : { count: records.length },
    p_result: resultSummary, p_error: succeeded === 0 ? 'all records failed' : null,
  });

  return NextResponse.json({ ok: succeeded > 0, ...resultSummary }, { status: httpStatus, headers });
}

/** Compact arg-builder for rejection/limit log rows (no body to record). */
function logArgs(
  companyId: string, keyId: string, entityKey: string, status: string, http: number, requestId: string,
  payload: object | null, error: string,
) {
  return {
    p_company_id: companyId, p_api_key_id: keyId, p_direction: 'inbound', p_source: 'rest_api',
    p_entity: entityKey, p_operation: `${entityKey}.write`, p_status: status, p_http_status: http,
    p_request_id: requestId, p_payload: payload, p_result: null, p_error: error,
  };
}
