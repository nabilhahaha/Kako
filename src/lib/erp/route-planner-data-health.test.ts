import { describe, it, expect } from 'vitest';
import { runDataHealth, dataHealthTotal, dataHealthCounts } from './route-planner-data-health';
import { summarizeSync, ManualUploadConnector, getConnector } from './route-planner-sync';

describe('dataHealthCounts (serialization-safe flat shape)', () => {
  it('flattens the nested report to { check: number } only (no objects)', () => {
    const report = runDataHealth({ customers: [
      { code: 'C1', name: 'A', lat: 24, lng: 46, salesman: 'S', route: 'R' },
      { code: 'C1', name: 'A', lat: 24, lng: 46, salesman: 'S', route: 'R' }, // duplicate
      { code: null, name: 'B', lat: null, lng: null, salesman: null, route: null }, // missing gps + code
    ] });
    const counts = dataHealthCounts(report);
    for (const v of Object.values(counts)) expect(typeof v).toBe('number');
    expect(counts.duplicate_customer).toBe(report.duplicate_customer?.count ?? 0);
    expect(counts.missing_gps).toBe(report.missing_gps?.count ?? 0);
    // sum of flat counts equals the report total (what the UI renders)
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(dataHealthTotal(report));
  });
});

describe('route-planner-data-health', () => {
  const customers = [
    { code: 'A1', name: 'Alpha', lat: 21.5, lng: 39.1, salesman: 'sm1', route: 'R1' },
    { code: 'B2', name: 'Beta', lat: 0, lng: 0, salesman: 'sm1', route: 'R1' },       // missing gps
    { code: '', name: 'NoCode', lat: 21.6, lng: 39.2, salesman: 'sm9', route: '' },   // missing code, invalid salesman, no route
    { code: 'A1', name: 'Dup', lat: 21.7, lng: 39.3, salesman: 'sm1', route: 'R1' },  // duplicate code
  ];

  it('flags missing code / gps / duplicate', () => {
    const r = runDataHealth({ customers, salesmen: ['sm1'] });
    expect(r.missing_customer_code?.count).toBe(1);
    expect(r.missing_gps?.count).toBe(1);
    expect(r.duplicate_customer?.count).toBe(1);
  });

  it('flags invalid salesman against the known set', () => {
    const r = runDataHealth({ customers, salesmen: ['sm1'] });
    expect(r.invalid_salesman?.count).toBe(1); // sm9
  });

  it('cross-checks routes/credit/returns/targets against master', () => {
    const r = runDataHealth({
      customers,
      sales: [{ code: 'A1', netSales: 100 }, { code: 'Z9', netSales: 50 }],
      credit: [{ code: 'A1' }, { code: 'X8' }],
      returns: [{ code: 'A1', value: 10 }, { code: 'NOPE', value: 5 }, { code: 'Z9', value: 7 }],
      routes: [{ code: 'A1' }, { code: 'GHOST' }],
      targets: [{ salesman: 'sm1' }, { salesman: 'smX' }],
      salesmen: ['sm1'],
    });
    expect(r.route_customer_missing?.count).toBe(1);   // GHOST
    expect(r.credit_no_customer?.count).toBe(1);       // X8
    expect(r.return_no_customer?.count).toBe(2);       // NOPE, Z9 (neither in master)
    expect(r.return_no_sales?.count).toBe(1);          // NOPE (no sales; Z9 has sales 50)
    expect(r.target_no_owner?.count).toBe(1);          // smX
  });

  it('skips checks whose datasets are absent', () => {
    const r = runDataHealth({ customers: [{ code: 'A', name: 'A', lat: 1, lng: 1 }] });
    expect(r.credit_no_customer).toBeUndefined();
    expect(r.return_no_customer).toBeUndefined();
    expect(r.target_no_owner).toBeUndefined();
  });

  it('dataHealthTotal sums counts', () => {
    const r = runDataHealth({ customers, salesmen: ['sm1'] });
    expect(dataHealthTotal(r)).toBeGreaterThanOrEqual(3);
  });
});

describe('route-planner-sync', () => {
  it('manual connector returns the uploaded rows', async () => {
    const c = new ManualUploadConnector([{ a: '1' }, { a: '2' }]);
    expect(c.type).toBe('manual_upload');
    expect(await c.fetchRows({}, 'customer_master')).toHaveLength(2);
    expect(getConnector('manual_upload', {}, [{ a: '1' }])).toBeInstanceOf(ManualUploadConnector);
    expect(getConnector('google_sheets', {})).toBeNull(); // not implemented yet
  });

  it('summarizeSync splits imported vs updated and counts rejects', () => {
    const master = { customers: [{ code: 'A', name: 'A', lat: 1, lng: 1 }, { code: 'B', name: 'B', lat: 1, lng: 1 }, { code: 'C', name: 'C', lat: 1, lng: 1 }] };
    const s = summarizeSync(master, { existingKeys: new Set(['a']), rejected: [{ row: 9, reason: 'missing_coords' }] });
    expect(s.rowsUpdated).toBe(1);   // A existed
    expect(s.rowsImported).toBe(2);  // B, C new
    expect(s.rowsRejected).toBe(1);
    expect(s.status).toBe('partial');
  });

  it('status is success with no rejects, failed when nothing imported', () => {
    expect(summarizeSync({ customers: [{ code: 'A', name: 'A', lat: 1, lng: 1 }] }).status).toBe('success');
    expect(summarizeSync({ customers: [] }, { rejected: [{ row: 1, reason: 'x' }] }).status).toBe('failed');
  });
});
