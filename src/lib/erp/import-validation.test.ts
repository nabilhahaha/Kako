import { describe, it, expect } from 'vitest';
import { summarizeValidationIssues, normalizeMessage, type ValidationJobLike } from './import-validation';

describe('import-validation · normalizeMessage', () => {
  it('collapses quoted values so the same problem groups', () => {
    expect(normalizeMessage('Invoice "INV-9" not found')).toBe('Invoice "…" not found');
    expect(normalizeMessage("Product 'P3' not found")).toBe("Product '…' not found");
  });
});

describe('import-validation · summarizeValidationIssues', () => {
  const jobs: ValidationJobLike[] = [
    { target_entity: 'customer', error_log: [
      { row: 1, severity: 'error', message: 'Name is required' },
      { row: 2, severity: 'warning', message: 'invalid email' },
    ] },
    { target_entity: 'invoice_line', error_log: [
      { row: 1, severity: 'error', message: 'Invoice "INV-9" not found' },
      { row: 2, severity: 'error', message: 'Invoice "INV-12" not found' },
      { row: 3, severity: 'info', message: 'ignored advisory' },
    ] },
    { target_entity: 'product', error_log: [] },
    // a rollback marker must not be counted as an issue
    { target_entity: 'customer', error_log: [{ __rollback: { at: 'x', deleted: 5 } }] },
  ];

  it('totals errors/warnings and counts jobs with issues', () => {
    const s = summarizeValidationIssues(jobs);
    expect(s.totalErrors).toBe(3);
    expect(s.totalWarnings).toBe(1);
    expect(s.jobsWithIssues).toBe(2); // product (empty) + marker-only job excluded
  });

  it('aggregates by entity, busiest first', () => {
    const s = summarizeValidationIssues(jobs);
    expect(s.byEntity[0].entityKey).toBe('invoice_line');
    expect(s.byEntity[0].errors).toBe(2);
    const customer = s.byEntity.find((e) => e.entityKey === 'customer')!;
    expect(customer).toEqual({ entityKey: 'customer', errors: 1, warnings: 1 });
  });

  it('groups the two not-found messages into one top message (count 2)', () => {
    const s = summarizeValidationIssues(jobs);
    const top = s.topMessages[0];
    expect(top.message).toBe('Invoice "…" not found');
    expect(top.count).toBe(2);
    expect(top.severity).toBe('error');
  });
});
