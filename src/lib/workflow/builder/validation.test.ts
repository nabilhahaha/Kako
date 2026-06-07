import { describe, it, expect } from 'vitest';
import { validateWorkflow, type BuilderDefinition } from './validation';
import type { RuntimeStep } from '../executors/types';

const def = (over: Partial<BuilderDefinition> = {}): BuilderDefinition => ({
  entity: 'customer', triggerEvent: 'customer.created', triggerConfig: {}, ...over,
});
const step = (over: Partial<RuntimeStep>): RuntimeStep => ({
  id: 's1', stepNo: 1, stepType: 'notification', name: null, config: { channel: 'email', template: 't' },
  approverType: null, approverRef: null, slaHours: null, escalateTo: null,
  condition: null, nextOnSuccess: null, nextOnFailure: null, ...over,
});

describe('validateWorkflow', () => {
  it('passes a valid single-step workflow', () => {
    expect(validateWorkflow(def(), [step({})])).toEqual([]);
  });
  it('flags an unknown trigger_event', () => {
    expect(validateWorkflow(def({ triggerEvent: 'nope.bad' }), [step({})])[0]).toMatch(/unknown trigger_event/);
  });
  it('allows manual trigger (null)', () => {
    expect(validateWorkflow(def({ triggerEvent: null }), [step({})])).toEqual([]);
  });
  it('requires at least one step', () => {
    expect(validateWorkflow(def(), [])).toEqual(['workflow has no steps']);
  });
  it('surfaces executor config errors (reused validators)', () => {
    const errs = validateWorkflow(def(), [step({ config: {} })]); // notification missing channel+template
    expect(errs.some((e) => /notification.*channel/.test(e))).toBe(true);
  });
  it('requires approver on approval steps', () => {
    const errs = validateWorkflow(def(), [step({ stepType: 'approval', config: {} })]);
    expect(errs.some((e) => /approver_type/.test(e))).toBe(true);
  });
  it('flags branch targets that point to missing steps', () => {
    expect(validateWorkflow(def(), [step({ nextOnSuccess: 'ghost' })]).some((e) => /missing step/.test(e))).toBe(true);
  });
  it('detects a cycle', () => {
    const a = step({ id: 'a', stepNo: 1, nextOnSuccess: 'b' });
    const b = step({ id: 'b', stepNo: 2, nextOnSuccess: 'a' });
    expect(validateWorkflow(def(), [a, b]).some((e) => /cycle/.test(e))).toBe(true);
  });
  it('accepts a linear branch graph (no cycle)', () => {
    const a = step({ id: 'a', stepNo: 1, nextOnSuccess: 'b' });
    const b = step({ id: 'b', stepNo: 2, stepType: 'reject' });
    expect(validateWorkflow(def(), [a, b])).toEqual([]);
  });
});
