// ============================================================================
// Offline backup scheduler (Phase P5)
// ----------------------------------------------------------------------------
// The cloud uses pg_cron for scheduled backups; offline has no always-on cron,
// so the local supervisor polls this pure decision function and runs a backup
// when one is due, based on the store's frequency setting + last backup time.
// Pure + unit-tested; the side-effecting backup is scripts/offline/backup.mjs.
// ============================================================================

export type BackupFrequency = 'off' | 'daily' | 'weekly';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** Whether a scheduled backup is due now. `off` never is; a store that has
 *  never been backed up always is; otherwise the configured interval must have
 *  elapsed since the last backup. */
export function isBackupDue(frequency: BackupFrequency, lastBackupAt: string | Date | null, now: Date = new Date()): boolean {
  if (frequency === 'off') return false;
  if (!lastBackupAt) return true;
  const last = lastBackupAt instanceof Date ? lastBackupAt : new Date(lastBackupAt);
  if (Number.isNaN(last.getTime())) return true; // unreadable → back up to be safe
  const elapsed = now.getTime() - last.getTime();
  return elapsed >= (frequency === 'weekly' ? WEEK_MS : DAY_MS);
}

/** Apply a retention policy to a list of backup filenames sorted however; returns
 *  the ones to DELETE (oldest beyond `keep`). Filenames must sort lexically by
 *  age via the ISO timestamp embedded by backup.mjs. */
export function backupsToPrune(files: string[], keep: number): string[] {
  if (keep <= 0) return [];
  const sorted = [...files].sort(); // ISO timestamps sort chronologically
  const excess = sorted.length - keep;
  return excess > 0 ? sorted.slice(0, excess) : [];
}
