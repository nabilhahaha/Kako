import { describe, it, expect } from 'vitest';
import {
  ONBOARDING_STEPS, setStepStatus, mergeDraft, computeProgress, canGoLive, blockingSteps,
  type StepStatusMap,
} from './state';

describe('onboarding state helpers (pure)', () => {
  it('setStepStatus is immutable and sets the value', () => {
    const a: StepStatusMap = { basics: 'done' };
    const b = setStepStatus(a, 'org', 'in_progress');
    expect(b).toEqual({ basics: 'done', org: 'in_progress' });
    expect(a).toEqual({ basics: 'done' }); // unchanged
  });

  it('mergeDraft shallow-merges per step without touching others', () => {
    const d = mergeDraft({ basics: { name: 'Acme' } }, 'basics', { country: 'EG' });
    expect(d.basics).toEqual({ name: 'Acme', country: 'EG' });
    const d2 = mergeDraft(d, 'org', { levels: 3 });
    expect(d2.org).toEqual({ levels: 3 });
    expect((d2.basics as object)).toEqual({ name: 'Acme', country: 'EG' });
  });

  it('computeProgress counts done and finds the resume step', () => {
    const map: StepStatusMap = { basics: 'done', industry: 'done', modules: 'skipped' };
    const p = computeProgress(map);
    expect(p.total).toBe(ONBOARDING_STEPS.length);
    expect(p.done).toBe(2);
    // modules is skipped → resume target is the first non-done/non-skipped step.
    expect(p.nextStep).toBe('organization');
    expect(p.pct).toBe(Math.round((2 / ONBOARDING_STEPS.length) * 100));
  });

  it('canGoLive requires every REQUIRED step done (skipped is not enough)', () => {
    const required = ONBOARDING_STEPS.filter((s) => s.required);
    // all required done → can go live
    const allDone: StepStatusMap = Object.fromEntries(required.map((s) => [s.key, 'done']));
    expect(canGoLive(allDone)).toBe(true);
    // skipping a required step blocks go-live
    const skipOne: StepStatusMap = { ...allDone, [required[0].key]: 'skipped' };
    expect(canGoLive(skipOne)).toBe(false);
    expect(blockingSteps(skipOne)).toEqual([required[0].key]);
  });

  it('optional/advanced steps never block go-live', () => {
    const required = ONBOARDING_STEPS.filter((s) => s.required);
    const map: StepStatusMap = Object.fromEntries(required.map((s) => [s.key, 'done']));
    // advanced steps left as todo
    expect(canGoLive(map)).toBe(true);
    expect(blockingSteps(map)).toEqual([]);
  });
});
