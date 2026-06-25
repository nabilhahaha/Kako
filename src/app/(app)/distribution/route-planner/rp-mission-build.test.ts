import { describe, it, expect } from 'vitest';
import {
  validateMissionPlan, selectedInOrder, moveSelected, toggleSelected, planToStops, planToMapPoints,
  type PlanCustomer,
} from './rp-mission-build';

const c = (id: string, over: Partial<PlanCustomer> = {}): PlanCustomer => ({
  id, code: id.toUpperCase(), name: `Cust ${id}`, lat: 24.7, lng: 46.7, city: null, channel: null, salesman: null, ...over,
});

describe('rp-mission-build — plan model', () => {
  it('validates name + at least one stop', () => {
    expect(validateMissionPlan({ name: '', selectedIds: ['a'] })).toBe('err_name_required');
    expect(validateMissionPlan({ name: 'Plan', selectedIds: [] })).toBe('err_no_stops');
    expect(validateMissionPlan({ name: 'Plan', selectedIds: ['a'] })).toBeNull();
  });

  it('selectedInOrder follows selection order, drops unknowns + dedups', () => {
    const all = [c('a'), c('b'), c('c')];
    const out = selectedInOrder(all, ['c', 'a', 'zzz', 'a']);
    expect(out.map((x) => x.id)).toEqual(['c', 'a']);
  });

  it('moveSelected swaps within bounds and is a no-op at edges', () => {
    expect(moveSelected(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveSelected(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(moveSelected(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']); // top edge
    expect(moveSelected(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c']); // bottom edge
  });

  it('toggleSelected appends on select, removes on deselect, preserves order', () => {
    expect(toggleSelected(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
    expect(toggleSelected(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });

  it('planToStops assigns 1-based seq in order', () => {
    const stops = planToStops([c('a'), c('b')]);
    expect(stops.map((s) => s.seq)).toEqual([1, 2]);
    expect(stops[0].customer.id).toBe('a');
  });

  it('planToMapPoints drops invalid coords and marks all pending', () => {
    const pts = planToMapPoints([c('a'), c('b', { lat: null, lng: null }), c('d', { lat: 0, lng: 0 })]);
    expect(pts.map((p) => p.id)).toEqual(['a']);
    expect(pts[0].completed).toBe(false);
  });
});
