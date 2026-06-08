import { describe, it, expect } from 'vitest';
import {
  ROUTE_INTEL_ENABLED,
  healthScore, healthBand, DEFAULT_HEALTH_WEIGHTS,
  salesmanDashboard, routeDashboard, supervisorDashboard, territoryDashboard, type HealthRow,
} from './index';

describe('route-intel/flags', () => {
  it('defaults OFF', () => {
    const prev = process.env.KAKO_ROUTE_INTEL;
    delete process.env.KAKO_ROUTE_INTEL;
    expect(ROUTE_INTEL_ENABLED()).toBe(false);
    process.env.KAKO_ROUTE_INTEL = '1';
    expect(ROUTE_INTEL_ENABLED()).toBe(true);
    if (prev === undefined) delete process.env.KAKO_ROUTE_INTEL; else process.env.KAKO_ROUTE_INTEL = prev;
  });
});

describe('health scoring (reuses pillars)', () => {
  it('weights the components + bands', () => {
    const h = healthScore({ coveragePct: 100, strikeRatePct: 100, adherencePct: 100, callCompliancePct: 100, productivityPct: 100 });
    expect(h.score).toBe(100);
    expect(h.band).toBe('gold');
    // coverage-led: 0.3*50 + 0.25*40 + 0.2*60 + 0.15*80 + 0.1*30 = 15+10+12+12+3 = 52
    const mixed = healthScore({ coveragePct: 50, strikeRatePct: 40, adherencePct: 60, callCompliancePct: 80, productivityPct: 30 });
    expect(mixed.score).toBe(52);
  });
  it('null components drop out + renormalise; no data → none', () => {
    expect(healthScore({ coveragePct: 80, strikeRatePct: null, adherencePct: null, callCompliancePct: null, productivityPct: null }).score).toBe(80);
    expect(healthScore({}).band).toBe('none');
    expect(healthBand(95)).toBe('gold');
    expect(DEFAULT_HEALTH_WEIGHTS.coverage).toBe(0.3);
  });
});

describe('dashboards', () => {
  const rows: HealthRow[] = [
    { entityId: 'S1', entityType: 'salesman', healthScore: 80, band: 'silver', coveragePct: 85, strikeRatePct: 60, adherencePct: 90, missedCustomers: 2, territoryId: 'T1', supervisorId: 'SUP1' },
    { entityId: 'S2', entityType: 'salesman', healthScore: 40, band: 'none', coveragePct: 50, strikeRatePct: 30, adherencePct: 55, missedCustomers: 10, territoryId: 'T1', supervisorId: 'SUP1' },
    { entityId: 'R1', entityType: 'route', healthScore: 70, band: 'bronze', coveragePct: 75, strikeRatePct: 55, adherencePct: 80, missedCustomers: 3, territoryId: 'T1' },
  ];
  it('salesman/route ranked weakest-first', () => {
    expect(salesmanDashboard(rows)[0].entityId).toBe('S2');
    expect(routeDashboard(rows).map((r) => r.entityId)).toEqual(['R1']);
  });
  it('supervisor rollup + territory rollup', () => {
    const sup = supervisorDashboard(rows);
    expect(sup[0].supervisorId).toBe('SUP1');
    expect(sup[0].team).toBe(2);
    expect(sup[0].avgHealth).toBe(60);          // (80+40)/2
    expect(sup[0].missedCustomers).toBe(12);
    const terr = territoryDashboard(rows);
    expect(terr[0].territoryId).toBe('T1');
    expect(terr[0].entities).toBe(3);
  });
});
