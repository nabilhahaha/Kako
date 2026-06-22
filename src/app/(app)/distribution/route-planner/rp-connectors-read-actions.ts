'use server';

// ============================================================================
// Phase C4 — read-only Route Planner connectors/import admin. Company-scoped READS over
// erp_rp_data_sources / erp_rp_field_mappings / erp_rp_sync_runs (RLS-enforced). No
// writes and no secrets returned: create/edit/sync actions are deferred to a later,
// reported phase. Connector config (which may hold auth refs) is intentionally NOT read.
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export interface DataSourceRow {
  id: string;
  name: string;
  type: string;
  status: string;          // active | paused | error
  schedule: string | null;
  lastSyncAt: string | null;
  lastStatus: string | null;
  mappings: number;
}
export interface SyncRunRow {
  id: string;
  label: string | null;
  status: string;          // running | success | failed | partial
  imported: number;
  rejected: number;
  at: string | null;
}
export interface ConnectorsView {
  sources: DataSourceRow[];
  recentSyncs: SyncRunRow[];
  healthy: number;         // sources with status='active'
}

export async function getConnectors(): Promise<Result<ConnectorsView>> {
  const ctx = await getUserContext();
  if (!ctx?.companyId) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const company = ctx.companyId;

  const [{ data: src, error: e1 }, { data: maps }, { data: runs, error: e3 }] = await Promise.all([
    sb.from('erp_rp_data_sources')
      .select('id, name, type, status, schedule, last_sync_at, last_status')
      .eq('company_id', company).order('created_at', { ascending: false }),
    sb.from('erp_rp_field_mappings').select('source_id').eq('company_id', company),
    sb.from('erp_rp_sync_runs')
      .select('id, source_label, status, rows_imported, rows_rejected, started_at, finished_at')
      .eq('company_id', company).order('started_at', { ascending: false }).limit(8),
  ]);
  if (e1) return { ok: false, error: e1.message };
  if (e3) return { ok: false, error: e3.message };

  const mapCount = new Map<string, number>();
  for (const m of maps ?? []) {
    const k = m.source_id as string;
    mapCount.set(k, (mapCount.get(k) ?? 0) + 1);
  }

  const sources: DataSourceRow[] = (src ?? []).map((s) => ({
    id: s.id as string,
    name: (s.name as string) ?? '',
    type: (s.type as string) ?? 'manual_upload',
    status: (s.status as string) ?? 'active',
    schedule: (s.schedule as string | null) ?? null,
    lastSyncAt: (s.last_sync_at as string | null) ?? null,
    lastStatus: (s.last_status as string | null) ?? null,
    mappings: mapCount.get(s.id as string) ?? 0,
  }));
  const recentSyncs: SyncRunRow[] = (runs ?? []).map((r) => ({
    id: r.id as string,
    label: (r.source_label as string | null) ?? null,
    status: (r.status as string) ?? 'running',
    imported: (r.rows_imported as number) ?? 0,
    rejected: (r.rows_rejected as number) ?? 0,
    at: (r.finished_at as string | null) ?? (r.started_at as string | null),
  }));
  const healthy = sources.filter((s) => s.status === 'active').length;

  return { ok: true, data: { sources, recentSyncs, healthy } };
}
