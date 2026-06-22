/**
 * Route Planner — sync engine (Integration Foundation). The ONE pipeline every source
 * flows through: fetch raw rows -> (caller maps to canonical rows) -> validate +
 * data-health -> a sync-run summary. Manual Upload is connector #1; Google Sheets /
 * API / scheduled implement only `fetchRows` later and reuse everything here.
 *
 * Pure / framework-free. The DB persistence (insert into erp_rp_sync_runs) is a thin
 * server-action wrapper added when the migrations are applied; this module computes the
 * summary it stores.
 */
import type { DataConnector, RawRow, RpEntity, RpSourceType } from './route-planner-backend';
import { runDataHealth, dataHealthTotal, type DataHealthInput, type DataHealthReport } from './route-planner-data-health';

/** Connector #1: the rows are whatever the user uploaded (already parsed to records). */
export class ManualUploadConnector implements DataConnector {
  readonly type: RpSourceType = 'manual_upload';
  private rows: RawRow[];
  constructor(rows: RawRow[]) { this.rows = rows; }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async fetchRows(_config: Record<string, unknown>, _entity: RpEntity): Promise<RawRow[]> {
    return this.rows;
  }
}

/** Registry so a source `type` resolves to its connector factory (Sheets/API plug in later). */
const REGISTRY: Partial<Record<RpSourceType, (config: Record<string, unknown>, rows?: RawRow[]) => DataConnector>> = {
  manual_upload: (_c, rows) => new ManualUploadConnector(rows ?? []),
};
export function getConnector(type: RpSourceType, config: Record<string, unknown>, rows?: RawRow[]): DataConnector | null {
  const make = REGISTRY[type];
  return make ? make(config, rows) : null;
}

export interface SyncSummary {
  rowsImported: number;
  rowsUpdated: number;
  rowsRejected: number;
  errors: { row: number; reason: string }[];
  quality: DataHealthReport;
  qualityIssues: number;
  status: 'success' | 'partial' | 'failed';
}

/**
 * Compute a sync-run summary from validated customer rows (the master dataset) plus the
 * optional datasets for data-health. `existingKeys` are the customer codes already known
 * (so rows split into imported [new] vs updated [existing]). `rejected` are rows the
 * caller's validation dropped (e.g. missing required fields). Pure.
 */
export function summarizeSync(
  master: DataHealthInput,
  opts: { existingKeys?: Set<string>; rejected?: { row: number; reason: string }[] } = {},
): SyncSummary {
  const existing = opts.existingKeys ?? new Set<string>();
  const rejected = opts.rejected ?? [];
  let imported = 0, updated = 0;
  for (const c of master.customers) {
    const key = (c.code ?? '').toString().trim().toLowerCase();
    if (key && existing.has(key)) updated++; else imported++;
  }
  const quality = runDataHealth(master);
  const qualityIssues = dataHealthTotal(quality);
  const status: SyncSummary['status'] = rejected.length === 0 ? 'success' : imported + updated > 0 ? 'partial' : 'failed';
  return { rowsImported: imported, rowsUpdated: updated, rowsRejected: rejected.length, errors: rejected, quality, qualityIssues, status };
}
