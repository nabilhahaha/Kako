/** ── Customer Onboarding — validation issue aggregation (pure, no I/O) ──────
 *
 *  Each import job records per-row issues in `erp_import_jobs.error_log`
 *  (`{ row, severity, message }`). The Validation Dashboard aggregates those
 *  across recent jobs so an onboarding lead can see, at a glance, the data-quality
 *  problems blocking go-live — total errors/warnings, which entity they hit, and
 *  the most common messages to fix once. Pure + testable.
 */

import { isRollbackMarker } from './import-rollback';

export interface ValidationJobLike {
  target_entity: string | null;
  error_log: unknown; // jsonb array of issues (+ optional rollback marker)
}

interface IssueLike { row?: number; severity?: string; message?: string }

export interface EntityIssueCount { entityKey: string; errors: number; warnings: number }
export interface TopMessage { message: string; severity: 'error' | 'warning' | 'info'; count: number }

export interface ValidationSummary {
  totalErrors: number;
  totalWarnings: number;
  jobsWithIssues: number;
  byEntity: EntityIssueCount[];
  topMessages: TopMessage[];
}

function severityOf(s: string | undefined): 'error' | 'warning' | 'info' {
  const v = (s ?? '').toLowerCase();
  return v === 'error' ? 'error' : v === 'warning' ? 'warning' : 'info';
}

/** Group similar messages by stripping quoted values: `Invoice "INV-9" not found`
 *  → `Invoice "…" not found`, so the same problem aggregates across rows. */
export function normalizeMessage(msg: string): string {
  return msg.replace(/"[^"]*"/g, '"…"').replace(/'[^']*'/g, "'…'").trim();
}

function issuesOf(errorLog: unknown): IssueLike[] {
  if (!Array.isArray(errorLog)) return [];
  return errorLog.filter((x): x is IssueLike => !!x && typeof x === 'object' && !isRollbackMarker(x));
}

/** Aggregate validation issues across import jobs (top messages capped at `limit`). */
export function summarizeValidationIssues(
  jobs: readonly ValidationJobLike[],
  limit = 10,
): ValidationSummary {
  let totalErrors = 0, totalWarnings = 0, jobsWithIssues = 0;
  const byEntity = new Map<string, EntityIssueCount>();
  const byMessage = new Map<string, TopMessage>();

  for (const job of jobs) {
    const issues = issuesOf(job.error_log);
    if (issues.length === 0) continue;
    let jobHasIssue = false;
    const ent = job.target_entity ?? 'unknown';
    const ec = byEntity.get(ent) ?? { entityKey: ent, errors: 0, warnings: 0 };

    for (const it of issues) {
      const sev = severityOf(it.severity);
      if (sev === 'info') continue;
      jobHasIssue = true;
      if (sev === 'error') { totalErrors++; ec.errors++; } else { totalWarnings++; ec.warnings++; }

      const norm = normalizeMessage(it.message ?? '');
      if (norm) {
        const key = `${sev}|${norm}`;
        const tm = byMessage.get(key) ?? { message: norm, severity: sev, count: 0 };
        tm.count++;
        byMessage.set(key, tm);
      }
    }
    byEntity.set(ent, ec);
    if (jobHasIssue) jobsWithIssues++;
  }

  const topMessages = [...byMessage.values()]
    .sort((a, b) => b.count - a.count || a.message.localeCompare(b.message))
    .slice(0, limit);
  const byEntityArr = [...byEntity.values()].sort(
    (a, b) => b.errors - a.errors || b.warnings - a.warnings || a.entityKey.localeCompare(b.entityKey),
  );

  return { totalErrors, totalWarnings, jobsWithIssues, byEntity: byEntityArr, topMessages };
}
