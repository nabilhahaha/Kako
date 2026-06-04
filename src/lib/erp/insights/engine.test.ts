import { describe, it, expect } from 'vitest';
import {
  classifyTrend, kpiDeltaInsight, customerDeclineInsight, coverageDropInsight,
  anomalyInsights, runRateForecast, forecastInsight, opportunityInsight, rankInsights,
} from './engine';

describe('insights · classifyTrend', () => {
  it('detects up/down/flat vs prior average', () => {
    expect(classifyTrend([10, 10, 20]).dir).toBe('up');
    expect(classifyTrend([20, 20, 5]).dir).toBe('down');
    expect(classifyTrend([10, 10, 10]).dir).toBe('flat');
    expect(classifyTrend([5]).dir).toBe('flat');
  });
});

describe('insights · KPI delta', () => {
  it('explains up (positive) and big down (danger), bilingual', () => {
    expect(kpiDeltaInsight('Sales', 120, 100, 'en').severity).toBe('positive');
    expect(kpiDeltaInsight('Sales', 50, 100, 'en').severity).toBe('danger');
    expect(/[؀-ۿ]/.test(kpiDeltaInsight('Sales', 50, 100, 'ar').title)).toBe(true);
  });
});

describe('insights · customer decline / opportunity', () => {
  it('flags a stopped customer as danger', () => {
    const i = customerDeclineInsight([100, 80, 0], 'Cust', 'en');
    expect(i?.code).toBe('customer_stopped');
    expect(i?.severity).toBe('danger');
  });
  it('flags a declining customer as warning', () => {
    expect(customerDeclineInsight([100, 100, 60], 'Cust', 'en')?.code).toBe('customer_declining');
  });
  it('returns null for a stable customer', () => {
    expect(customerDeclineInsight([100, 100, 100], 'Cust', 'en')).toBeNull();
  });
  it('flags growth as an opportunity', () => {
    expect(opportunityInsight([100, 100, 140], 'Cust', 'en')?.code).toBe('opportunity_growth');
    expect(opportunityInsight([100, 100, 90], 'Cust', 'en')).toBeNull();
  });
});

describe('insights · coverage drop', () => {
  it('flags a significant drop only', () => {
    expect(coverageDropInsight(60, 90, 'en')?.code).toBe('coverage_drop');
    expect(coverageDropInsight(88, 90, 'en')).toBeNull();
    expect(coverageDropInsight(null, 90, 'en')).toBeNull();
  });
});

describe('insights · anomaly detection', () => {
  it('flags an unusual drop', () => {
    const i = anomalyInsights('Sales', [100, 100, 100, 100, 100, 20], 'en');
    expect(i[0]?.code).toBe('anomaly_drop');
  });
  it('no anomaly on steady series', () => {
    expect(anomalyInsights('Sales', [100, 101, 99, 100, 100], 'en')).toHaveLength(0);
  });
});

describe('insights · forecast', () => {
  it('run-rate projection', () => {
    expect(runRateForecast(100, 10, 30)).toBe(300);
    expect(runRateForecast(100, 0, 30)).toBe(0);
  });
  it('forecast vs target', () => {
    expect(forecastInsight(100, 250, 10, 30, 'en').severity).toBe('positive'); // projects 300 ≥ 250
    expect(forecastInsight(50, 500, 10, 30, 'en').severity).toBe('danger');    // projects 150 < 350
  });
});

describe('insights · ranking', () => {
  it('orders danger → warning → info → positive', () => {
    const ranked = rankInsights([
      { code: 'a', kind: 'kpi', severity: 'positive', title: '' },
      { code: 'b', kind: 'kpi', severity: 'danger', title: '' },
      { code: 'c', kind: 'kpi', severity: 'info', title: '' },
    ]);
    expect(ranked.map((i) => i.severity)).toEqual(['danger', 'info', 'positive']);
  });
});
