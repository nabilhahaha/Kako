import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getEntity } from '@/lib/erp/entities';
import { ingestRecord, type IngestMode } from '@/lib/erp/integration-ingest';
import { pullGenericRest, pushGenericRest } from '@/lib/erp/connectors/runtime/generic-rest-runtime';
import { pullCsvSftp, pushCsvSftp, type SftpAuth, type FileFormat } from '@/lib/erp/connectors/runtime/csv-sftp-runtime';
import { pullDynamicsBc, pushDynamicsBc, bcEntitySet, type BcConfig } from '@/lib/erp/connectors/runtime/dynamics-bc-runtime';
import { pullSapS4, pushSapS4, sapEntityPath, type SapConfig } from '@/lib/erp/connectors/runtime/sap-s4-runtime';
import { sapFileFieldMap } from '@/lib/erp/connectors/sap-presets';
import { pullOdoo, pushOdoo, odooModel, type OdooConfig } from '@/lib/erp/connectors/runtime/odoo-runtime';
import { odooPreset } from '@/lib/erp/connectors/odoo-presets';
import { pullNetSuite, pushNetSuite, netsuiteRecordType, type NetSuiteConfig } from '@/lib/erp/connectors/runtime/netsuite-runtime';
import { netsuitePreset } from '@/lib/erp/connectors/netsuite-presets';

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
      const adapter = j.adapter;
      if (adapter !== 'generic_rest' && adapter !== 'csv_sftp' && adapter !== 'dynamics_bc' && adapter !== 'sap_s4' && adapter !== 'odoo' && adapter !== 'netsuite') {
        await db.rpc('erp_sync_complete', { p_run_id: j.run_id, p_status: 'failed', p_pulled: 0, p_written: 0, p_skipped: 0, p_failed: 0, p_cursor_after: null, p_error: `adapter ${adapter} not supported yet` });
        results.push({ job: j.job_id, status: 'failed', error: 'adapter not supported' });
        continue;
      }
      const icfg = j.integration_config ?? {};
      const jcfg = j.job_config ?? {};
      const fieldMap = (jcfg.field_map as Record<string, string>) ?? undefined;
      const sftpAuth = (): SftpAuth => ({
        host: String(icfg.host ?? ''), port: icfg.port != null ? Number(icfg.port) : undefined,
        username: String(icfg.username ?? ''), secret: j.secret,
        isPrivateKey: typeof j.secret === 'string' && j.secret.includes('PRIVATE KEY'),
      });
      const sftpPath = String((jcfg.path as string) ?? (icfg.remote_path as string) ?? '');
      const sftpFormat = (String((jcfg.format as string) ?? (icfg.format as string) ?? 'csv') === 'json' ? 'json' : 'csv') as FileFormat;
      const bcCfg = (): BcConfig => ({
        tenantId: String(icfg.tenant_id ?? ''), clientId: String(icfg.client_id ?? ''),
        environment: String(icfg.environment ?? ''), companyId: String(icfg.company_id ?? ''),
        apiVersion: (icfg.api_version as string) || undefined,
      });
      const bcEntity = () => String((jcfg.entity_set as string) ?? bcEntitySet(j.entity) ?? '');
      const sapCfg = (): SapConfig => ({
        baseUrl: String(icfg.base_url ?? ''),
        auth: String(icfg.auth_kind ?? 'basic') === 'oauth2' ? 'oauth2' : 'basic',
        odataVersion: icfg.odata_version === 'v4' ? 'v4' : 'v2',
        tokenUrl: icfg.token_url as string | undefined, clientId: icfg.client_id as string | undefined,
        scope: icfg.scope as string | undefined, username: icfg.username as string | undefined,
      });
      const sapPath = () => String((jcfg.entity_set as string) ?? sapEntityPath(j.entity) ?? '');
      // B3b: SAP transport selector — 'file' (On-Prem/ECC via SFTP) vs 'odata'
      // (B3a; default when unset). File transport reuses the B1 csv_sftp runtime
      // with SAP IDoc field presets (job field_map still overrides).
      const sapIsFile = adapter === 'sap_s4' && String(icfg.transport ?? 'odata') === 'file';
      const odooCfg = (): OdooConfig => ({
        baseUrl: String(icfg.base_url ?? ''), database: String(icfg.database ?? ''), username: String(icfg.username ?? ''),
      });
      const nsCfg = (): NetSuiteConfig => ({
        accountId: String(icfg.account_id ?? ''), consumerKey: String(icfg.consumer_key ?? ''), tokenId: String(icfg.token_id ?? ''),
      });

      if (j.direction === 'in') {
        let records: Record<string, unknown>[] = [];
        let cursorAfter: string | null = null;
        if (adapter === 'generic_rest') {
          const pull = await pullGenericRest({
            baseUrl: String(icfg.base_url ?? ''), path: jcfg.path as string | undefined,
            authHeader: icfg.auth_header as string | undefined, authScheme: icfg.auth_scheme as string | undefined, token: j.secret,
            recordsPath: icfg.records_path as string | undefined,
            cursorParam: jcfg.cursor_param as string | undefined, cursor: j.mode === 'delta' ? j.job_cursor : null,
            cursorField: jcfg.cursor_field as string | undefined, fieldMap,
          });
          records = pull.records; cursorAfter = pull.cursorAfter;
        } else if (adapter === 'csv_sftp') {
          const pull = await pullCsvSftp({ auth: sftpAuth(), remotePath: sftpPath, format: sftpFormat, fieldMap });
          records = pull.records; cursorAfter = null; // file feeds: full each run
        } else if (adapter === 'dynamics_bc') {
          const entitySet = bcEntity();
          if (!entitySet) throw new Error(`no Business Central entity set for "${j.entity}"`);
          const pull = await pullDynamicsBc({
            cfg: bcCfg(), entitySet, clientSecret: j.secret ?? '',
            cursor: j.mode === 'delta' ? j.job_cursor : null,
            cursorField: (jcfg.cursor_field as string) || 'lastModifiedDateTime', fieldMap,
          });
          records = pull.records; cursorAfter = pull.cursorAfter;
        } else if (sapIsFile) {
          // SAP On-Prem/ECC file feed (SFTP) — full snapshot each run.
          const pull = await pullCsvSftp({
            auth: sftpAuth(), remotePath: sftpPath, format: sftpFormat,
            fieldMap: fieldMap ?? sapFileFieldMap(j.entity, 'in'),
          });
          records = pull.records; cursorAfter = null;
        } else if (adapter === 'odoo') {
          const model = String((jcfg.model as string) ?? odooModel(j.entity) ?? '');
          if (!model) throw new Error(`no Odoo model for "${j.entity}"`);
          const preset = odooPreset(j.entity, 'in');
          const pull = await pullOdoo({
            cfg: odooCfg(), model, secret: j.secret ?? '',
            cursor: j.mode === 'delta' ? j.job_cursor : null,
            cursorField: (jcfg.cursor_field as string) || 'write_date',
            fields: (jcfg.fields as string[]) ?? preset?.fields,
            domain: (jcfg.domain as unknown[]) ?? preset?.domain,
            fieldMap: fieldMap ?? preset?.fieldMap,
          });
          records = pull.records; cursorAfter = pull.cursorAfter;
        } else if (adapter === 'netsuite') {
          const recordType = String((jcfg.record_type as string) ?? netsuiteRecordType(j.entity) ?? '');
          if (!recordType) throw new Error(`no NetSuite record type for "${j.entity}"`);
          const pull = await pullNetSuite({
            cfg: nsCfg(), recordType, secret: j.secret ?? '',
            cursor: j.mode === 'delta' ? j.job_cursor : null,
            cursorField: (jcfg.cursor_field as string) || 'lastModifiedDate',
            fieldMap: fieldMap ?? netsuitePreset(j.entity, 'in')?.fieldMap,
          });
          records = pull.records; cursorAfter = pull.cursorAfter;
        } else {
          const path = sapPath();
          if (!path) throw new Error(`no SAP entity path for "${j.entity}"`);
          const pull = await pullSapS4({
            cfg: sapCfg(), path, secret: j.secret ?? '',
            cursor: j.mode === 'delta' ? j.job_cursor : null,
            cursorField: (jcfg.cursor_field as string) || undefined, fieldMap,
          });
          records = pull.records; cursorAfter = pull.cursorAfter;
        }
        const mode = ingestModeFor(j.conflict_policy);
        let written = 0, skipped = 0, failed = 0;
        for (const rec of records) {
          const r = await ingestRecord(db, j.company_id, j.entity, rec, mode);
          if (r.ok) written++;
          else if ((r.error ?? '').includes('already exists')) skipped++;
          else failed++;
        }
        const status = failed > 0 ? (written > 0 ? 'partial' : 'failed') : 'ok';
        await db.rpc('erp_sync_complete', { p_run_id: j.run_id, p_status: status, p_pulled: records.length, p_written: written, p_skipped: skipped, p_failed: failed, p_cursor_after: cursorAfter, p_error: null });
        results.push({ job: j.job_id, status, written, skipped, failed });
      } else {
        // outbound push — entities with a company_id column
        const entity = getEntity(j.entity);
        if (!entity) throw new Error('unknown entity');
        const cols = (entity.fields ?? []).map((f) => f.key);
        const selectCols = ['id', ...cols, 'updated_at'].join(',');
        let q = db.from(entity.table).select(selectCols).eq('company_id', j.company_id).limit(PUSH_BATCH);
        if (j.mode === 'delta' && j.job_cursor && adapter === 'generic_rest') q = q.gt('updated_at', j.job_cursor);
        const { data: rows, error: readErr } = await q;
        if (readErr) throw new Error(readErr.message);
        const recs = ((rows ?? []) as unknown as Record<string, unknown>[]);
        let sent = 0, failedCount = 0;
        let cursorAfter: string | null = j.job_cursor;
        if (adapter === 'generic_rest') {
          const push = await pushGenericRest({
            baseUrl: String(icfg.base_url ?? ''), path: jcfg.path as string | undefined,
            authHeader: icfg.auth_header as string | undefined, authScheme: icfg.auth_scheme as string | undefined, token: j.secret,
            records: recs, fieldMap,
          });
          sent = push.sent; failedCount = push.failed;
          for (const r of recs) { const u = r.updated_at as string | undefined; if (u && (cursorAfter == null || u > cursorAfter)) cursorAfter = u; }
        } else if (adapter === 'csv_sftp') {
          const push = await pushCsvSftp({ auth: sftpAuth(), remotePath: sftpPath, format: sftpFormat, records: recs, fieldMap });
          sent = push.sent; cursorAfter = null; // whole-file write
        } else if (adapter === 'dynamics_bc') {
          const entitySet = bcEntity();
          if (!entitySet) throw new Error(`no Business Central entity set for "${j.entity}"`);
          const push = await pushDynamicsBc({ cfg: bcCfg(), entitySet, clientSecret: j.secret ?? '', records: recs, fieldMap });
          sent = push.sent; failedCount = push.failed;
          for (const r of recs) { const u = r.updated_at as string | undefined; if (u && (cursorAfter == null || u > cursorAfter)) cursorAfter = u; }
        } else if (sapIsFile) {
          // SAP On-Prem/ECC outbound file (SFTP) — whole-file write (ORDERS/INVOIC).
          const push = await pushCsvSftp({
            auth: sftpAuth(), remotePath: sftpPath, format: sftpFormat, records: recs,
            fieldMap: fieldMap ?? sapFileFieldMap(j.entity, 'out'),
          });
          sent = push.sent; cursorAfter = null;
        } else if (adapter === 'odoo') {
          const model = String((jcfg.model as string) ?? odooModel(j.entity) ?? '');
          if (!model) throw new Error(`no Odoo model for "${j.entity}"`);
          const preset = odooPreset(j.entity, 'out');
          const push = await pushOdoo({ cfg: odooCfg(), model, secret: j.secret ?? '', records: recs, fieldMap: fieldMap ?? preset?.fieldMap });
          sent = push.sent; failedCount = push.failed;
          for (const r of recs) { const u = r.updated_at as string | undefined; if (u && (cursorAfter == null || u > cursorAfter)) cursorAfter = u; }
        } else if (adapter === 'netsuite') {
          const recordType = String((jcfg.record_type as string) ?? netsuiteRecordType(j.entity) ?? '');
          if (!recordType) throw new Error(`no NetSuite record type for "${j.entity}"`);
          const push = await pushNetSuite({ cfg: nsCfg(), recordType, secret: j.secret ?? '', records: recs, fieldMap: fieldMap ?? netsuitePreset(j.entity, 'out')?.fieldMap });
          sent = push.sent; failedCount = push.failed;
          for (const r of recs) { const u = r.updated_at as string | undefined; if (u && (cursorAfter == null || u > cursorAfter)) cursorAfter = u; }
        } else {
          const path = sapPath();
          if (!path) throw new Error(`no SAP entity path for "${j.entity}"`);
          const push = await pushSapS4({ cfg: sapCfg(), path, secret: j.secret ?? '', records: recs, fieldMap });
          sent = push.sent; failedCount = push.failed;
          for (const r of recs) { const u = r.updated_at as string | undefined; if (u && (cursorAfter == null || u > cursorAfter)) cursorAfter = u; }
        }
        const status = failedCount > 0 ? (sent > 0 ? 'partial' : 'failed') : 'ok';
        await db.rpc('erp_sync_complete', { p_run_id: j.run_id, p_status: status, p_pulled: recs.length, p_written: sent, p_skipped: 0, p_failed: failedCount, p_cursor_after: cursorAfter, p_error: null });
        results.push({ job: j.job_id, status, written: sent, failed: failedCount });
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
