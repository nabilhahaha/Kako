/**
 * Integration Hub — import-job monitoring (pure, no I/O). Summarizes the existing
 * `erp_import_jobs` audit rows into hub KPIs (jobs by status, rows, success rate)
 * and recent activity. Pure + testable; the page supplies RLS-scoped rows.
 */

export interface ImportJobLike {
  status: string | null;
  total_rows: number | null;
  success_rows: number | null;
  failed_rows: number | null;
}

export interface ImportSummary {
  jobs: number;
  completed: number;
  failed: number;
  running: number;
  totalRows: number;
  successRows: number;
  failedRows: number;
  /** % of processed rows that succeeded (0..100); 100 when nothing processed. */
  successRate: number;
}

function bucket(status: string | null): 'completed' | 'failed' | 'running' {
  const s = (status ?? '').toLowerCase();
  if (s === 'completed' || s === 'success' || s === 'done') return 'completed';
  if (s === 'failed' || s === 'error') return 'failed';
  return 'running'; // pending / processing / queued / unknown
}

export function summarizeImportJobs(jobs: readonly ImportJobLike[]): ImportSummary {
  let completed = 0, failed = 0, running = 0, totalRows = 0, successRows = 0, failedRows = 0;
  for (const j of jobs) {
    const b = bucket(j.status);
    if (b === 'completed') completed++; else if (b === 'failed') failed++; else running++;
    totalRows += Math.max(0, j.total_rows ?? 0);
    successRows += Math.max(0, j.success_rows ?? 0);
    failedRows += Math.max(0, j.failed_rows ?? 0);
  }
  const processed = successRows + failedRows;
  const successRate = processed === 0 ? 100 : Math.round((successRows / processed) * 100);
  return { jobs: jobs.length, completed, failed, running, totalRows, successRows, failedRows, successRate };
}

/** Health band for the import pipeline (drives the monitoring card tone). */
export function importHealth(summary: ImportSummary): 'good' | 'attention' | 'critical' {
  if (summary.failed === 0 && summary.successRate >= 95) return 'good';
  if (summary.successRate >= 80) return 'attention';
  return 'critical';
}
