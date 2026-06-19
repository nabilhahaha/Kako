import { describe, it, expect } from 'vitest';
import { datasetToCsv, csvToRows, TIS_CSV_COLUMNS } from './export';
import { buildTisDatasetFromRows } from './upload';
import { buildJeddahDemoDataset } from './demo/jeddah';
import { balanceRoutes } from './optimize-routes';
import { applyScenario, scenarioMetrics } from './scenario';

describe('TIS single-model export/import round-trip (RO-3)', () => {
  // Import (demo) → Optimize → Export → Re-import.
  const ds = buildJeddahDemoDataset();
  const plan = balanceRoutes(ds.customers, { routeCount: 6 });
  const optimized = applyScenario(ds, { id: 'opt', name: 'opt', assignments: plan.assignments });

  const csv = datasetToCsv(optimized);
  const rows = csvToRows(csv);
  const reimported = buildTisDatasetFromRows(rows);

  it('exports the single-model header', () => {
    expect(csv.split('\n')[0]).toBe(TIS_CSV_COLUMNS.join(','));
    expect(csv.split('\n')).toHaveLength(501); // header + 500
  });

  it('re-imports without remapping — same population', () => {
    expect(reimported.customers).toHaveLength(500);
    expect(reimported.source).toBe('upload');
  });

  it('preserves the optimized routing + key fields per customer', () => {
    const before = new Map(optimized.customers.map((c) => [c.id, c]));
    for (const c of reimported.customers) {
      const b = before.get(c.id)!;
      expect(b).toBeDefined();
      expect(c.ownership.routeId).toBe(b.ownership.routeId);       // optimized route survived
      expect(c.ownership.salesmanId).toBe(b.ownership.salesmanId);
      expect(c.grade).toBe(b.grade);
      expect(c.coverage).toBe(b.coverage);
      expect(c.salesValue).toBe(b.salesValue);
      expect(c.frequency).toEqual(b.frequency);                   // FR token round-trips
      expect(c.geo!.lat).toBeCloseTo(b.geo!.lat, 6);
    }
  });

  it('metrics are identical after the round-trip (lossless)', () => {
    const m1 = scenarioMetrics(optimized);
    const m2 = scenarioMetrics(reimported);
    expect(m2.visits).toBe(m1.visits);
    expect(m2.salesValue).toBe(m1.salesValue);
    expect(m2.routeCount).toBe(m1.routeCount);
    expect(m2.routeBalancePct).toBe(m1.routeBalancePct);
  });

  it('tolerates column reordering on re-import', () => {
    const reordered = ['routeId,id,name,frequency,coverage,salesValue,lat,lng,salesmanId,grade',
      ...csvToRows(csv).slice(0, 3).map((r) => [r.routeId, r.id, r.name, r.frequency, r.coverage, r.salesValue, r.lat, r.lng, r.salesmanId, r.grade].join(','))].join('\n');
    const back = buildTisDatasetFromRows(csvToRows(reordered));
    expect(back.customers).toHaveLength(3);
    expect(back.customers[0].ownership.routeId).toBeTruthy();
  });
});
