import { describe, it, expect } from 'vitest';
import {
  buildOnboardingPlan, deriveEntityStatus, onboardingEntityKeys, ONBOARDING_PHASES,
  type OnboardingJobLike,
} from './onboarding';

describe('onboarding · deriveEntityStatus', () => {
  it('no jobs → notStarted', () => {
    expect(deriveEntityStatus([])).toBe('notStarted');
  });
  it('any completed job → completed (even if others failed)', () => {
    expect(deriveEntityStatus([
      { target_entity: 'customer', status: 'failed', success_rows: 0, created_at: null },
      { target_entity: 'customer', status: 'completed', success_rows: 10, created_at: null },
    ])).toBe('completed');
  });
  it('running but none completed → inProgress', () => {
    expect(deriveEntityStatus([{ target_entity: 'customer', status: 'importing', success_rows: 0, created_at: null }])).toBe('inProgress');
  });
  it('only failed → failed', () => {
    expect(deriveEntityStatus([{ target_entity: 'customer', status: 'failed', success_rows: 0, created_at: null }])).toBe('failed');
  });
});

describe('onboarding · sequencing', () => {
  it('orders parents before children (foundation→master→transactions deps)', () => {
    const keys = onboardingEntityKeys();
    const pos = (k: string) => keys.indexOf(k);
    expect(pos('branch')).toBeGreaterThanOrEqual(0);
    expect(pos('warehouse')).toBeGreaterThan(pos('branch'));
    expect(pos('stock')).toBeGreaterThan(pos('warehouse'));
    expect(pos('stock')).toBeGreaterThan(pos('product'));
    expect(pos('invoice_line')).toBeGreaterThan(pos('product'));
    expect(pos('sales_return')).toBeGreaterThan(pos('customer'));
  });
});

describe('onboarding · buildOnboardingPlan', () => {
  const jobs: OnboardingJobLike[] = [
    { target_entity: 'customer', status: 'completed', success_rows: 120, created_at: '2026-06-01T10:00:00Z' },
    { target_entity: 'customer', status: 'completed', success_rows: 5, created_at: '2026-06-02T10:00:00Z' },
    { target_entity: 'product', status: 'failed', success_rows: 0, created_at: '2026-06-01T11:00:00Z' },
  ];

  it('produces three phase groups in canonical order', () => {
    const plan = buildOnboardingPlan(jobs);
    expect(plan.groups.map((g) => g.phase)).toEqual(ONBOARDING_PHASES);
    expect(plan.groups.every((g) => g.steps.length > 0)).toBe(true);
  });

  it('rolls up status, success rows and last timestamp per entity', () => {
    const plan = buildOnboardingPlan(jobs);
    const customer = plan.steps.find((s) => s.key === 'customer')!;
    expect(customer.status).toBe('completed');
    expect(customer.jobs).toBe(2);
    expect(customer.successRows).toBe(125);
    expect(customer.lastAt).toBe('2026-06-02T10:00:00Z');
    expect(customer.phase).toBe('master');

    const product = plan.steps.find((s) => s.key === 'product')!;
    expect(product.status).toBe('failed');
  });

  it('computes progress = completed entities / total', () => {
    const plan = buildOnboardingPlan(jobs);
    expect(plan.completedCount).toBe(1); // only customer completed
    expect(plan.progress).toBe(Math.round((1 / plan.totalCount) * 100));
    // entities with no jobs are notStarted
    expect(plan.steps.find((s) => s.key === 'warehouse')!.status).toBe('notStarted');
  });
});
