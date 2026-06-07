import { describe, it, expect } from 'vitest';
import { stepsToGraph, graphToSteps, unreachableStepIds, TRIGGER_NODE_ID, type StepRow, type DefLike } from './graph-model';

const def: DefLike = { id: 'def1', trigger_event: 'customer.created' };
const row = (over: Partial<StepRow>): StepRow => ({
  id: 's1', step_no: 1, step_type: 'notification', name: 'notify', config: { channel: 'email', template: 't' },
  approver_type: null, approver_ref: null, sla_hours: null, escalate_to: null, condition: null,
  next_on_success: null, next_on_failure: null, ui_position: null, ...over,
});

describe('graph-model: stepsToGraph', () => {
  it('adds a virtual trigger node carrying the definition trigger_event', () => {
    const g = stepsToGraph([row({})], def);
    const trig = g.nodes.find((n) => n.id === TRIGGER_NODE_ID)!;
    expect(trig.type).toBe('trigger');
    expect(trig.data.triggerEvent).toBe('customer.created');
  });

  it('links the trigger to the entry (lowest step_no) node', () => {
    const g = stepsToGraph([row({ id: 'b', step_no: 2 }), row({ id: 'a', step_no: 1 })], def);
    const e = g.edges.find((x) => x.source === TRIGGER_NODE_ID)!;
    expect(e.target).toBe('a');
  });

  it('materializes implicit sequential fall-through as a success edge', () => {
    const g = stepsToGraph([row({ id: 'a', step_no: 1 }), row({ id: 'b', step_no: 2 })], def);
    const seq = g.edges.find((x) => x.source === 'a' && x.target === 'b');
    expect(seq?.kind).toBe('success');
  });

  it('emits explicit success + failure edges and no sequential when branched', () => {
    const g = stepsToGraph([
      row({ id: 'a', step_no: 1, step_type: 'approval', approver_type: 'company_admin', next_on_success: 'b', next_on_failure: 'c' }),
      row({ id: 'b', step_no: 2 }), row({ id: 'c', step_no: 3, step_type: 'reject' }),
    ], def);
    const fromA = g.edges.filter((x) => x.source === 'a');
    expect(fromA.find((x) => x.kind === 'success')?.target).toBe('b');
    expect(fromA.find((x) => x.kind === 'failure')?.target).toBe('c');
    expect(fromA).toHaveLength(2);
  });

  it('ignores dangling branch targets that do not exist', () => {
    const g = stepsToGraph([row({ id: 'a', step_no: 1, next_on_success: 'ghost' })], def);
    expect(g.edges.filter((x) => x.source === 'a')).toHaveLength(0);
  });

  it('uses saved ui_position when present', () => {
    const g = stepsToGraph([row({ id: 'a', ui_position: { x: 42, y: 99 } })], def);
    expect(g.nodes.find((n) => n.id === 'a')!.position).toEqual({ x: 42, y: 99 });
  });
});

describe('graph-model: graphToSteps (materialization + round-trip)', () => {
  it('materializes a linear sequence into explicit next_on_success', () => {
    const g = stepsToGraph([row({ id: 'a', step_no: 1 }), row({ id: 'b', step_no: 2 })], def);
    const { steps } = graphToSteps(g);
    const a = steps.find((s) => s.id === 'a')!;
    expect(a.next_on_success).toBe('b'); // previously implicit, now explicit
    expect(steps.find((s) => s.id === 'b')!.next_on_success).toBeNull();
  });

  it('preserves explicit branches through a round-trip', () => {
    const src = [
      row({ id: 'a', step_no: 1, step_type: 'approval', approver_type: 'company_admin', next_on_success: 'b', next_on_failure: 'c' }),
      row({ id: 'b', step_no: 2 }), row({ id: 'c', step_no: 3, step_type: 'reject' }),
    ];
    const { steps } = graphToSteps(stepsToGraph(src, def));
    const a = steps.find((s) => s.id === 'a')!;
    expect(a.next_on_success).toBe('b');
    expect(a.next_on_failure).toBe('c');
    expect(a.step_type).toBe('approval');
  });

  it('preserves node positions back into ui_position', () => {
    const { steps } = graphToSteps(stepsToGraph([row({ id: 'a', ui_position: { x: 10, y: 20 } })], def));
    expect(steps.find((s) => s.id === 'a')!.ui_position).toEqual({ x: 10, y: 20 });
  });

  it('assigns deterministic step_no by traversal (success before failure)', () => {
    const src = [
      row({ id: 'a', step_no: 1, step_type: 'approval', approver_type: 'company_admin', next_on_success: 'b', next_on_failure: 'c' }),
      row({ id: 'b', step_no: 2 }), row({ id: 'c', step_no: 3, step_type: 'reject' }),
    ];
    const { steps } = graphToSteps(stepsToGraph(src, def));
    expect(steps.find((s) => s.id === 'a')!.step_no).toBe(1);
    expect(steps.find((s) => s.id === 'b')!.step_no).toBe(2);
    expect(steps.find((s) => s.id === 'c')!.step_no).toBe(3);
  });

  it('reports the entry id from the trigger edge', () => {
    const { entryId } = graphToSteps(stepsToGraph([row({ id: 'a', step_no: 1 })], def));
    expect(entryId).toBe('a');
  });
});

describe('graph-model: unreachableStepIds', () => {
  it('flags nodes not reachable from the trigger entry', () => {
    const g = stepsToGraph([row({ id: 'a', step_no: 1 })], def);
    // inject an orphan node with no incoming edge
    g.nodes.push({ id: 'orphan', type: 'task', label: 'x', position: { x: 0, y: 0 }, data: { config: { title: 't' } } });
    expect(unreachableStepIds(g)).toContain('orphan');
    expect(unreachableStepIds(g)).not.toContain('a');
  });
});
