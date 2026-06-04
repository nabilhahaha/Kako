import { describe, it, expect } from 'vitest';
import { summarizeImportJobs, importHealth, type ImportJobLike } from './import-monitor';

const jobs: ImportJobLike[] = [
  { status: 'completed', total_rows: 100, success_rows: 100, failed_rows: 0 },
  { status: 'completed', total_rows: 50, success_rows: 45, failed_rows: 5 },
  { status: 'failed', total_rows: 20, success_rows: 0, failed_rows: 20 },
  { status: 'processing', total_rows: 10, success_rows: 0, failed_rows: 0 },
];

describe('import-monitor', () => {
  it('summarizes jobs by status + rows + success rate', () => {
    const s = summarizeImportJobs(jobs);
    expect(s.jobs).toBe(4);
    expect(s.completed).toBe(2);
    expect(s.failed).toBe(1);
    expect(s.running).toBe(1);
    expect(s.totalRows).toBe(180);
    expect(s.successRows).toBe(145);
    expect(s.failedRows).toBe(25);
    expect(s.successRate).toBe(85); // 145 / 170
  });
  it('empty → 100% (nothing processed)', () => {
    const s = summarizeImportJobs([]);
    expect(s.successRate).toBe(100);
    expect(s.jobs).toBe(0);
  });
  it('health bands', () => {
    expect(importHealth(summarizeImportJobs([{ status: 'completed', total_rows: 10, success_rows: 10, failed_rows: 0 }]))).toBe('good');
    expect(importHealth(summarizeImportJobs(jobs))).toBe('attention'); // 85% rows ok despite a failed job
    expect(importHealth({ jobs: 1, completed: 0, failed: 1, running: 0, totalRows: 100, successRows: 50, failedRows: 50, successRate: 50 })).toBe('critical'); // <80%
  });
});
