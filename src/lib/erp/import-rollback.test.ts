import { describe, it, expect } from 'vitest';
import {
  rollbackEligibility, buildRollbackList, hasRollbackMarker, isRollbackMarker,
  type RollbackJobLike,
} from './import-rollback';

describe('import-rollback · rollbackEligibility', () => {
  it('master-data entities that stamp import_job_id are reversible', () => {
    expect(rollbackEligibility('customer')).toEqual({ eligible: true, reason: 'ok' });
    expect(rollbackEligibility('product')).toEqual({ eligible: true, reason: 'ok' });
  });
  it('child tables without import_job_id are not reversible', () => {
    expect(rollbackEligibility('invoice_line')).toEqual({ eligible: false, reason: 'noAudit' });
    expect(rollbackEligibility('collection')).toEqual({ eligible: false, reason: 'noAudit' });
    expect(rollbackEligibility('warehouse')).toEqual({ eligible: false, reason: 'noAudit' });
  });
  it('unknown / null entity → unknownEntity', () => {
    expect(rollbackEligibility(null).reason).toBe('unknownEntity');
    expect(rollbackEligibility('nope').reason).toBe('unknownEntity');
  });
});

describe('import-rollback · markers', () => {
  it('detects a rollback marker in an error_log array', () => {
    expect(isRollbackMarker({ __rollback: { at: 'x', deleted: 3 } })).toBe(true);
    expect(isRollbackMarker({ row: 1, message: 'm' })).toBe(false);
    expect(hasRollbackMarker([{ row: 1 }, { __rollback: { at: 'x', deleted: 1 } }])).toBe(true);
    expect(hasRollbackMarker([{ row: 1 }])).toBe(false);
  });
});

describe('import-rollback · buildRollbackList', () => {
  const base = (over: Partial<RollbackJobLike>): RollbackJobLike => ({
    id: 'j', target_entity: 'customer', file_name: 'c.csv', status: 'completed',
    total_rows: 10, success_rows: 10, created_at: '2026-06-01T00:00:00Z', ...over,
  });

  it('eligible: completed customer import with successes', () => {
    const [row] = buildRollbackList([base({})]);
    expect(row.eligible).toBe(true);
    expect(row.reason).toBe('ok');
  });
  it('ineligible: child table (noAudit)', () => {
    const [row] = buildRollbackList([base({ target_entity: 'invoice_line' })]);
    expect(row.eligible).toBe(false);
    expect(row.reason).toBe('noAudit');
  });
  it('ineligible: not completed / zero successes', () => {
    expect(buildRollbackList([base({ status: 'failed', success_rows: 0 })])[0].reason).toBe('notCompleted');
    expect(buildRollbackList([base({ status: 'completed', success_rows: 0 })])[0].reason).toBe('notCompleted');
  });
  it('ineligible + flagged when already rolled back', () => {
    const [row] = buildRollbackList([base({ error_log: [{ __rollback: { at: 'x', deleted: 10 } }] })]);
    expect(row.rolledBack).toBe(true);
    expect(row.eligible).toBe(false);
    expect(row.reason).toBe('alreadyRolledBack');
  });
});
