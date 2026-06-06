import { describe, it, expect } from 'vitest';
import { isBackupDue, backupsToPrune } from './scheduler';

describe('offline backup scheduler', () => {
  const now = new Date('2026-06-05T10:00:00Z');
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000).toISOString();

  it('off is never due', () => {
    expect(isBackupDue('off', null, now)).toBe(false);
    expect(isBackupDue('off', hoursAgo(1000), now)).toBe(false);
  });

  it('a never-backed-up store is always due (when not off)', () => {
    expect(isBackupDue('daily', null, now)).toBe(true);
    expect(isBackupDue('weekly', null, now)).toBe(true);
  });

  it('daily: due after 24h, not before', () => {
    expect(isBackupDue('daily', hoursAgo(23), now)).toBe(false);
    expect(isBackupDue('daily', hoursAgo(25), now)).toBe(true);
  });

  it('weekly: due after 7 days, not before', () => {
    expect(isBackupDue('weekly', hoursAgo(24 * 6), now)).toBe(false);
    expect(isBackupDue('weekly', hoursAgo(24 * 8), now)).toBe(true);
  });

  it('an unreadable last-backup timestamp errs toward backing up', () => {
    expect(isBackupDue('daily', 'not-a-date', now)).toBe(true);
  });

  describe('retention', () => {
    const files = [
      'kako-2026-06-01T02-00-00Z.dump',
      'kako-2026-06-02T02-00-00Z.dump',
      'kako-2026-06-03T02-00-00Z.dump',
      'kako-2026-06-04T02-00-00Z.dump',
    ];
    it('keeps the newest N, prunes the oldest', () => {
      expect(backupsToPrune(files, 2)).toEqual([
        'kako-2026-06-01T02-00-00Z.dump',
        'kako-2026-06-02T02-00-00Z.dump',
      ]);
    });
    it('prunes nothing when under the limit', () => {
      expect(backupsToPrune(files, 10)).toEqual([]);
    });
    it('keep<=0 prunes nothing (guard against wiping all backups)', () => {
      expect(backupsToPrune(files, 0)).toEqual([]);
    });
  });
});
