import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getEntity } from '@/lib/erp/entities';
import { ingestRecord, type IngestMode } from '@/lib/erp/integration-ingest';
import { pullGenericRest, pushGenericRest } from '@/lib/erp/connectors/runtime/generic-rest-runtime';

/** ── Sync dispatcher — POST/GET /api/internal/sync-tick ────────────────────
 *  Triggered by Vercel Cron (Authorization: Bearer $CRON_SECRET). Claims due
 *  sync jobs (service-role), runs the REST adapter pull/push, writes inbound
 *  records through the shared entity-ingest path (company-scoped), and finalises
 *  each run. Node runtime (service-role client + fetch). REST-first; csv_sftp is
 *  a later sub-slice. */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_JOBS = 10;
const PUSH_BATCH = 200;

interface ClaimedJob {
  run_id: string; job_id: string; company_id: string; integration_id: string; entity: string;
  direction: 'in' | 'out'; mode: 'full' | 'delta'; conflict_policy: string;
  job_config: Record<string, unknown>; job_cursor: string | null;
  adapter: string; integration_config: Record<string, unknown>; secret: string | null;
}

function ingestModeFor(policy: string): IngestMode {
  // source_wins overwrites; vantora_wins / manual_review never overwrite existing rows.
  return policy === 'source_wins' ? 'upsert' : 'insert';
}

export async function POST(req: NextRequest) {
  // Auth: Vercel Cron sends Authorization: Bearer $CRON_SECRET.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') ?? '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let db;
  try { db = createServiceClient(); } catch {
    return NextResponse.json({ error: 'unconfigured' }, { status: 503 });
  }

  const { data: claimed, error: claimErr } = await db.rpc('erp_sync_claim_due', { p_limit: MAX_JOBS });
  if (claimErr) return NextResponse.json({ error: claimErr.message }, { status: 500 });
  const jobs = (claimed as ClaimedJob[] | null) ?? [];

  const results: { job: string; status: string; written?: number; skipped?: number; failed?: number; error?: string }[] = [];

  for (const j of jobs) {
    try {
      if (j.adapter !== 'generic_rest') {
        await db.rpc('erp_sync_complete', { p_run_id: j.run_id, p_status: 'failed', p_pulled: 0, p_written: 0, p_skipped: 0, p_failed: 0, p_cursor_after: null, p_error: `adapter ${j.adapter} not supported yet` });
        results.push({ job: j.job_id, status: 'failed', error: 'adapter not supported' });
        continue;
      }
      const icfg = j.integration_config ?? {};
      const jcfg = j.job_config ?? {};
      const baseUrl = String(icfg.base_url ?? '');
      const fieldMap = (jcfg.field_map as Record<string, string>) ?? undefined;

      if (j.direction === 'in') {
        const pull = await pullGenericRest({
          baseUrl, path: jcfg.path as string | undefined,
          authHeader: icfg.auth_header as string | undefined, authScheme: icfg.auth_scheme as string | undefined, token: j.secret,
          recordsPath: icfg.records_path as string | undefined,
          cursorParam: jcfg.cursor_param as string | undefined, cursor: j.mode === 'delta' ? j.job_cursor : null,
          cursorField: jcfg.cursor_field as string | undefined, fieldMap,
        });
        const mode = ingestModeFor(j.conflict_policy);
        let written = 0, skipped = 0, failed = 0;
        for (const rec of pull.records) {
          const r = await ingestRecord(db, j.company_id, j.entity, rec, mode);
          if (r.ok) written++;
          else if ((r.error ?? '').includes('already exists')) skipped++;
          else failed++;
        }
        const status = failed > 0 ? (written > 0 ? 'partial' : 'failed') : 'ok';
        await db.rpc('erp_sync_complete', { p_run_id: j.run_id, p_status: status, p_pulled: pull.records.length, p_written: written, p_skipped: skipped, p_failed: failed, p_cursor_after: pull.cursorAfter, p_error: null });
        results.push({ job: j.job_id, status, written, skipped, failed });
      } else {
        // outbound push — only entities with a company_id column are supported in 2C-2
        const entity = getEntity(j.entity);
        if (!entity) throw new Error('unknown entity');
        const cols = (entity.fields ?? []).map((f) => f.key);
        const selectCols = ['id', ...cols, 'updated_at'].join(',');
        let q = db.from(entity.table).select(selectCols).eq('company_id', j.company_id).limit(PUSH_BATCH);
        if (j.mode === 'delta' && j.job_cursor) q = q.gt('updated_at', j.job_cursor);
        const { data: rows, error: readErr } = await q;
        if (readErr) throw new Error(readErr.message);
        const recs = ((rows ?? []) as unknown as Record<string, unknown>[]);
        const push = await pushGenericRest({
          baseUrl, path: jcfg.path as string | undefined,
          authHeader: icfg.auth_header as string | undefined, authScheme: icfg.auth_scheme as string | undefined, token: j.secret,
          records: recs, fieldMap,
        });
        let cursorAfter: string | null = j.job_cursor;
        for (const r of recs) { const u = r.updated_at as string | undefined; if (u && (cursorAfter == null || u > cursorAfter)) cursorAfter = u; }
        const status = push.failed > 0 ? (push.sent > 0 ? 'partial' : 'failed') : 'ok';
        await db.rpc('erp_sync_complete', { p_run_id: j.run_id, p_status: status, p_pulled: recs.length, p_written: push.sent, p_skipped: 0, p_failed: push.failed, p_cursor_after: cursorAfter, p_error: null });
        results.push({ job: j.job_id, status, written: push.sent, failed: push.failed });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'sync failed';
      await db.rpc('erp_sync_complete', { p_run_id: j.run_id, p_status: 'failed', p_pulled: 0, p_written: 0, p_skipped: 0, p_failed: 0, p_cursor_after: null, p_error: msg });
      results.push({ job: j.job_id, status: 'failed', error: msg });
    }
  }

  return NextResponse.json({ ok: true, claimed: jobs.length, results }, { headers: { 'Cache-Control': 'no-store' } });
}

// Vercel Cron issues GET by default; accept both.
export const GET = POST;
